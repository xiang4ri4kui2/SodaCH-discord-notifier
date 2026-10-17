import fs from 'node:fs/promises';
import path from 'node:path';

// Supplementary investigation report only.
// This script DOES NOT read or modify data/streamsMaster.json.
const CHANNELS_PATH = path.resolve('data/channels.json');
const OUTPUT_PATH = path.resolve('data/streamsMasterSupplement.json');
const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const HTTP_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const VIDEO_BATCH_SIZE = 50;
const PAGE_SIZE = 50;
const EXPECTED_COUNT = 36; // Informational only; never filters output.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtmlEntities(value) {
  if (typeof value !== 'string' || !value) return value;

  const named = {
    amp: '&',
    quot: '"',
    apos: "'",
    '#39': "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
  };

  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      try {
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      } catch {
        return match;
      }
    })
    .replace(/&#(\d+);/g, (match, decimal) => {
      const codePoint = Number(decimal);
      try {
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      } catch {
        return match;
      }
    })
    .replace(
      /&(amp|quot|apos|#39|lt|gt|nbsp);/g,
      (match, entity) => named[entity] ?? match,
    );
}

async function readJsonArray(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      `${filePath} must contain a JSON array at the top level.`,
    );
  }

  return parsed;
}

async function writeJsonAtomically(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await fs.writeFile(
      tempPath,
      `${JSON.stringify(data, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );

    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});

    throw new Error(
      `Failed to write ${filePath} safely: ${error.message}`,
    );
  }
}

function getApiKey() {
  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    throw new Error(
      'Environment variable YOUTUBE_API_KEY is not set.',
    );
  }

  return key;
}

function retryDelayMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(
        seconds * 1_000,
        MAX_RETRY_DELAY_MS,
      );
    }

    const dateMs = Date.parse(retryAfterHeader);

    if (Number.isFinite(dateMs)) {
      return Math.min(
        Math.max(0, dateMs - Date.now()),
        MAX_RETRY_DELAY_MS,
      );
    }
  }

  return Math.min(
    INITIAL_RETRY_DELAY_MS * (2 ** (attempt - 1))
      + Math.floor(Math.random() * 300),
    MAX_RETRY_DELAY_MS,
  );
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchJsonWithRetry(url, label) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    let response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_RETRIES) break;

      const delay = retryDelayMs(attempt);

      console.warn(
        `[RETRY] ${label}: network error `
        + `(${attempt}/${MAX_RETRIES}); waiting ${delay}ms.`,
      );

      await sleep(delay);
      continue;
    }

    const responseText = await response.text();
    let payload;

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {
        rawResponse: responseText.slice(0, 1_000),
      };
    }

    if (response.ok) return payload;

    const message =
      payload?.error?.message
      || responseText
      || response.statusText;

    const error = new Error(
      `${label}: HTTP ${response.status} ${message}`,
    );

    error.status = response.status;
    lastError = error;

    if (
      !isRetryableStatus(response.status)
      || attempt >= MAX_RETRIES
    ) {
      break;
    }

    const delay = retryDelayMs(
      attempt,
      response.headers.get('retry-after'),
    );

    console.warn(
      `[RETRY] ${label}: HTTP ${response.status} `
      + `(${attempt}/${MAX_RETRIES}); waiting ${delay}ms.`,
    );

    await sleep(delay);
  }

  throw new Error(
    `${label}: exhausted ${MAX_RETRIES} attempts. `
    + `${lastError?.message || 'Unknown error'}`,
  );
}

function apiUrl(resource, params) {
  const url = new URL(`${API_BASE_URL}/${resource}`);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined
      && value !== null
      && value !== ''
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set('key', getApiKey());

  return url;
}

async function getUploadsPlaylistId(channelId) {
  const url = apiUrl('channels', {
    part: 'contentDetails,snippet',
    id: channelId,
    fields:
      'items(id,snippet(title),contentDetails(relatedPlaylists(uploads)))',
  });

  const data = await fetchJsonWithRetry(
    url,
    `YouTube Channels API (${channelId})`,
  );

  const channel = data.items?.find(
    (item) => item.id === channelId,
  );

  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      `Uploads Playlist ID unavailable: ${channelId}`,
    );
  }

  return {
    uploadsPlaylistId,
    channelTitle: decodeHtmlEntities(
      channel.snippet?.title || '',
    ),
  };
}

async function fetchAllUploads(playlistId, channelId) {
  const ids = [];
  const playlistItemsById = new Map();

  let pageToken = '';
  let pageNumber = 0;

  do {
    pageNumber += 1;

    const url = apiUrl('playlistItems', {
      part: 'snippet,contentDetails,status',
      playlistId,
      maxResults: PAGE_SIZE,
      pageToken,
      fields:
        'nextPageToken,pageInfo(totalResults),'
        + 'items('
        + 'snippet(title,publishedAt,channelId,resourceId(videoId)),'
        + 'contentDetails(videoId,videoPublishedAt),'
        + 'status(privacyStatus)'
        + ')',
    });

    const data = await fetchJsonWithRetry(
      url,
      `YouTube PlaylistItems API (${channelId}, page ${pageNumber})`,
    );

    for (const item of data.items || []) {
      const videoId =
        item.contentDetails?.videoId
        || item.snippet?.resourceId?.videoId;

      if (!videoId || playlistItemsById.has(videoId)) {
        continue;
      }

      ids.push(videoId);

      playlistItemsById.set(videoId, {
        videoId,
        title: decodeHtmlEntities(
          item.snippet?.title || '',
        ),
        published:
          item.contentDetails?.videoPublishedAt
          || item.snippet?.publishedAt
          || '',
        playlistPrivacyStatus:
          item.status?.privacyStatus || '',
      });
    }

    pageToken = data.nextPageToken || '';

    console.log(
      `[FETCH] ${channelId}: playlist page=${pageNumber}, `
      + `thisPage=${(data.items || []).length}, `
      + `cumulativeUnique=${ids.length}, `
      + `totalResults=${data.pageInfo?.totalResults ?? 'unknown'}`,
    );
  } while (pageToken);

  return { ids, playlistItemsById };
}

async function fetchVideoDetailsBatch(videoIds, channelId) {
  const url = apiUrl('videos', {
    part: 'snippet,contentDetails,liveStreamingDetails,status',
    id: videoIds.join(','),
    fields:
      'items('
      + 'id,'
      + 'snippet(title,description,publishedAt,channelId,channelTitle,liveBroadcastContent),'
      + 'contentDetails(duration),'
      + 'liveStreamingDetails(scheduledStartTime,actualStartTime,actualEndTime),'
      + 'status(privacyStatus,embeddable)'
      + ')',
  });

  const data = await fetchJsonWithRetry(
    url,
    `YouTube Videos API (${channelId}, ${videoIds.length} IDs)`,
  );

  return new Map(
    (data.items || []).map((item) => [item.id, item]),
  );
}

function isoOrEmpty(value) {
  if (!value) return '';

  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : '';
}

function parseIsoDuration(duration) {
  if (typeof duration !== 'string') return '';

  const match = duration.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!match) return '';

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function makeSupplementRecord(
  video,
  playlistItem,
  channel,
  fetchedAt,
) {
  const live = video.liveStreamingDetails || {};

  const actualStartTime = isoOrEmpty(live.actualStartTime);
  const actualEndTime = isoOrEmpty(live.actualEndTime);

  const missingFields = [];

  if (!actualStartTime) {
    missingFields.push('actualStartTime');
  }

  if (!actualEndTime) {
    missingFields.push('actualEndTime');
  }

  return {
    videoId: video.id,
    title: decodeHtmlEntities(
      video.snippet?.title
      || playlistItem.title
      || '',
    ),
    url: `https://www.youtube.com/watch?v=${video.id}`,
    channel:
      channel.channelName
      || decodeHtmlEntities(video.snippet?.channelTitle || ''),
    channelId:
      video.snippet?.channelId
      || channel.channelId,
    description: decodeHtmlEntities(
      video.snippet?.description || '',
    ),
    published: isoOrEmpty(
      video.snippet?.publishedAt
      || playlistItem.published,
    ),
    scheduledStartTime: isoOrEmpty(
      live.scheduledStartTime,
    ),
    actualStartTime,
    actualEndTime,
    missingFields,
    duration: parseIsoDuration(
      video.contentDetails?.duration,
    ),
    visibility:
      video.status?.privacyStatus
      || playlistItem.playlistPrivacyStatus
      || 'unknown',
    liveBroadcastContent:
      video.snippet?.liveBroadcastContent || 'unknown',
    hasLiveStreamingDetails: Boolean(
      video.liveStreamingDetails,
    ),
    embeddable: video.status?.embeddable ?? null,
    fetchedAt,
  };
}

async function processChannel(channel, reportById, stats) {
  console.log(
    `\n========== ${channel.channelName || channel.channelId} ==========`,
  );

  const { uploadsPlaylistId, channelTitle } =
    await getUploadsPlaylistId(channel.channelId);

  console.log(
    `[INFO] channel=${channelTitle || channel.channelName}, `
    + `uploadsPlaylistId=${uploadsPlaylistId}`,
  );

  const { ids, playlistItemsById } =
    await fetchAllUploads(
      uploadsPlaylistId,
      channel.channelId,
    );

  stats.uploadPlaylistItems += ids.length;

  const fetchedAt = new Date().toISOString();
  const batchCount = Math.ceil(
    ids.length / VIDEO_BATCH_SIZE,
  );

  for (
    let offset = 0;
    offset < ids.length;
    offset += VIDEO_BATCH_SIZE
  ) {
    const batch = ids.slice(
      offset,
      offset + VIDEO_BATCH_SIZE,
    );

    const batchNo =
      Math.floor(offset / VIDEO_BATCH_SIZE) + 1;

    const detailsById = await fetchVideoDetailsBatch(
      batch,
      channel.channelId,
    );

    for (const videoId of batch) {
      const playlistItem =
        playlistItemsById.get(videoId);

      const video = detailsById.get(videoId);

      if (!video) {
        stats.unavailableOrInaccessible += 1;
        continue;
      }

      if (
        video.snippet?.channelId
        && video.snippet.channelId !== channel.channelId
      ) {
        stats.wrongChannel += 1;
        continue;
      }

      const record = makeSupplementRecord(
        video,
        playlistItem || {},
        channel,
        fetchedAt,
      );

      // Match buildStreamsMaster.js:
      // include when either actual start OR actual end is missing.
      if (
        record.actualStartTime
        && record.actualEndTime
      ) {
        continue;
      }

      reportById.set(videoId, record);
    }

    console.log(
      `[FETCH] ${channel.channelId}: video details batch `
      + `${batchNo}/${batchCount} (${batch.length} IDs)`,
    );
  }
}

async function main() {
  const startedAt = Date.now();

  // Fail early if the API key is absent.
  getApiKey();

  const channels = await readJsonArray(CHANNELS_PATH);

  if (channels.length === 0) {
    throw new Error(
      `${CHANNELS_PATH} contains no channels.`,
    );
  }

  const reportById = new Map();

  const stats = {
    channels: channels.length,
    uploadPlaylistItems: 0,
    missingActualStartOrEnd: 0,
    withLiveStreamingDetails: 0,
    withoutLiveStreamingDetails: 0,
    unavailableOrInaccessible: 0,
    wrongChannel: 0,
  };

  console.log('=== buildStreamsMasterSupplement.js START ===');
  console.log(`Started at: ${new Date(startedAt).toISOString()}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log(
    'Safety: streamsMaster.json will not be read or modified.',
  );

  for (const channel of channels) {
    if (!channel?.channelId) {
      throw new Error(
        `${CHANNELS_PATH} contains a record without channelId.`,
      );
    }

    await processChannel(channel, reportById, stats);
  }

  const results = [...reportById.values()].sort((a, b) => {
    const aTime = Date.parse(a.published || '') || 0;
    const bTime = Date.parse(b.published || '') || 0;

    return aTime - bTime
      || a.videoId.localeCompare(b.videoId);
  });

  stats.missingActualStartOrEnd = results.length;
  stats.withLiveStreamingDetails = results.filter(
    (row) => row.hasLiveStreamingDetails,
  ).length;
  stats.withoutLiveStreamingDetails =
    results.length - stats.withLiveStreamingDetails;
  stats.expectedCount = EXPECTED_COUNT;
  stats.countMatchesExpected =
    results.length === EXPECTED_COUNT;
  stats.elapsedSeconds = Number(
    ((Date.now() - startedAt) / 1_000).toFixed(1),
  );

  await writeJsonAtomically(OUTPUT_PATH, results);

  console.log(
    '\n=== buildStreamsMasterSupplement.js SUMMARY ===',
  );
  console.log(JSON.stringify(stats, null, 2));

  if (results.length !== EXPECTED_COUNT) {
    console.warn(
      `[WARNING] Expected ${EXPECTED_COUNT} records, `
      + `but retrieved ${results.length}. `
      + 'Check changes in the source data or filtering conditions.',
    );
  }

  console.log(
    `Updated: ${OUTPUT_PATH} (${results.length} records)`,
  );

  console.log(
    'Note: missingActualStartOrEnd means actualStartTime '
    + 'or actualEndTime is missing. It does not guarantee '
    + 'that a video is a completed livestream archive. '
    + 'Use hasLiveStreamingDetails as an additional review clue.',
  );

  console.log(
    '=== buildStreamsMasterSupplement.js END ===',
  );
}

main().catch((error) => {
  console.error(
    '[FATAL] buildStreamsMasterSupplement.js failed. '
    + 'streamsMaster.json was not modified.',
  );
  console.error(error?.stack || error);
  process.exitCode = 1;
});
