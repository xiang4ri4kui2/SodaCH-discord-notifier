import fs from 'node:fs/promises';
import path from 'node:path';

const CHANNELS_PATH = 'data/channels.json';
const STREAMS_MASTER_PATH = 'data/streamsMaster.json';
const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

const HTTP_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const VIDEO_BATCH_SIZE = 50;
const PAGE_SIZE = 50;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : _;
    })
    .replace(/&#(\d+);/g, (match, decimal) => {
      const codePoint = Number(decimal);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(
      /&(amp|quot|apos|#39|lt|gt|nbsp);/g,
      (match, entity) => named[entity] ?? match
    );
}

async function readJsonStrict(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error(
        `${filePath} の最上位データは JSON 配列である必要があります。`
      );
    }

    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;

    throw new Error(
      `${filePath} の読み込みに失敗しました。` +
      `既存データを変更せず終了します。詳細: ${error.message}`
    );
  }
}

async function writeJsonAtomically(filePath, data) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });

  const tempPath =
    `${filePath}.tmp-${process.pid}-${Date.now()}`;

  const json = `${JSON.stringify(data, null, 2)}\n`;

  try {
    await fs.writeFile(tempPath, json, {
      encoding: 'utf8',
      flag: 'wx',
    });

    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});

    throw new Error(
      `${filePath} の安全な書き込みに失敗しました。` +
      `元ファイルは可能な限り保持しました。詳細: ${error.message}`
    );
  }
}

function getApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GitHub Secret / 環境変数 YOUTUBE_API_KEY が設定されていません。'
    );
  }

  return apiKey;
}

function retryDelayMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(
        seconds * 1_000,
        MAX_RETRY_DELAY_MS
      );
    }

    const dateMs = Date.parse(retryAfterHeader);

    if (Number.isFinite(dateMs)) {
      return Math.min(
        Math.max(0, dateMs - Date.now()),
        MAX_RETRY_DELAY_MS
      );
    }
  }

  const exponential =
    INITIAL_RETRY_DELAY_MS * (2 ** (attempt - 1));

  const jitter = Math.floor(Math.random() * 300);

  return Math.min(
    exponential + jitter,
    MAX_RETRY_DELAY_MS
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
        `[RETRY] ${label}: 通信エラー ` +
        `(${attempt}/${MAX_RETRIES})。` +
        `${delay}ms 待機します。${error.message}`
      );

      await sleep(delay);
      continue;
    }

    let payload;
    const responseText = await response.text();

    try {
      payload = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      payload = {
        rawResponse: responseText.slice(0, 1_000),
      };
    }

    if (response.ok) return payload;

    const apiError = payload?.error;
    const message =
      apiError?.message ||
      responseText ||
      response.statusText;

    const error = new Error(
      `${label}: HTTP ${response.status} ${message}`
    );

    error.status = response.status;
    lastError = error;

    if (
      !isRetryableStatus(response.status) ||
      attempt >= MAX_RETRIES
    ) {
      break;
    }

    const delay = retryDelayMs(
      attempt,
      response.headers.get('retry-after')
    );

    console.warn(
      `[RETRY] ${label}: HTTP ${response.status} ` +
      `(${attempt}/${MAX_RETRIES})。` +
      `${delay}ms 待機します。`
    );

    await sleep(delay);
  }

  throw new Error(
    `${label}: 最大リトライ回数 ${MAX_RETRIES} 回に達しました。` +
    `${lastError?.message || '原因不明のエラー'}`
  );
}

function apiUrl(resource, params) {
  const url = new URL(`${API_BASE_URL}/${resource}`);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
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
      'items(id,snippet(title),' +
      'contentDetails(relatedPlaylists(uploads)))',
  });

  const data = await fetchJsonWithRetry(
    url,
    `YouTube Channels API (${channelId})`
  );

  const channel = data.items?.find(
    (item) => item.id === channelId
  );

  if (!channel) {
    throw new Error(
      `チャンネル情報が見つかりません: ${channelId}`
    );
  }

  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      `Uploads Playlist ID が取得できません: ${channelId}`
    );
  }

  return {
    uploadsPlaylistId,
    channelTitle: decodeHtmlEntities(
      channel.snippet?.title || ''
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
        'nextPageToken,pageInfo(totalResults),' +
        'items(snippet(title,publishedAt,channelId,' +
        'resourceId(videoId)),' +
        'contentDetails(videoId,videoPublishedAt),' +
        'status(privacyStatus))',
    });

    const data = await fetchJsonWithRetry(
      url,
      `YouTube PlaylistItems API ` +
      `(${channelId}, page ${pageNumber})`
    );

    for (const item of data.items || []) {
      const videoId =
        item.contentDetails?.videoId ||
        item.snippet?.resourceId?.videoId;

      if (!videoId) continue;

      if (!playlistItemsById.has(videoId)) {
        ids.push(videoId);

        playlistItemsById.set(videoId, {
          videoId,
          title: decodeHtmlEntities(
            item.snippet?.title || ''
          ),
          published:
            item.contentDetails?.videoPublishedAt ||
            item.snippet?.publishedAt ||
            '',
          playlistPrivacyStatus:
            item.status?.privacyStatus || '',
        });
      }
    }

    pageToken = data.nextPageToken || '';

    console.log(
      `[FETCH] ${channelId}: ` +
      `playlist page=${pageNumber}, ` +
      `thisPage=${(data.items || []).length}, ` +
      `cumulativeUnique=${ids.length}, ` +
      `totalResults=${data.pageInfo?.totalResults ?? 'unknown'}`
    );
  } while (pageToken);

  return {
    ids,
    playlistItemsById,
  };
}

async function fetchVideoDetailsBatch(videoIds, channelId) {
  const url = apiUrl('videos', {
    part: 'snippet,contentDetails,liveStreamingDetails,status',
    id: videoIds.join(','),
    fields:
      'items(id,' +
      'snippet(title,publishedAt,channelId,channelTitle,liveBroadcastContent),' +
      'contentDetails(duration),' +
      'liveStreamingDetails(scheduledStartTime,actualStartTime,actualEndTime),' +
      'status(privacyStatus,embeddable))',
  });

  const data = await fetchJsonWithRetry(
    url,
    `YouTube Videos API (${channelId}, ${videoIds.length} IDs)`
  );

  return new Map(
    (data.items || []).map((item) => [item.id, item])
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
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );

  if (!match) return '';

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function makeMasterRecord(
  video,
  playlistItem,
  channel,
  fetchedAt
) {
  const details = video.liveStreamingDetails || {};

  const privacyStatus =
    video.status?.privacyStatus ||
    playlistItem.playlistPrivacyStatus ||
    'unknown';

  return {
    videoId: video.id,

    title: decodeHtmlEntities(
      video.snippet?.title ||
      playlistItem.title ||
      ''
    ),

    channel:
      channel.channelName ||
      decodeHtmlEntities(video.snippet?.channelTitle || ''),

    published: isoOrEmpty(
      video.snippet?.publishedAt ||
      playlistItem.published
    ),

    scheduledStartTime: isoOrEmpty(
      details.scheduledStartTime
    ),

    actualStartTime: isoOrEmpty(
      details.actualStartTime
    ),

    actualEndTime: isoOrEmpty(
      details.actualEndTime
    ),

    duration: parseIsoDuration(
      video.contentDetails?.duration
    ),

    visibility: privacyStatus,

    fetchedAt,
  };
}

function isCompletedStream(record) {
  return Boolean(
    record.actualStartTime &&
    record.actualEndTime
  );
}

function getYear(value) {
  if (!value) return 'unknown';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'unknown'
    : String(date.getUTCFullYear());
}

async function processChannel(
  channel,
  existingById,
  stats
) {
  console.log(
    `\n========== ${channel.channelName || channel.channelId} ==========`
  );

  const {
    uploadsPlaylistId,
    channelTitle,
  } = await getUploadsPlaylistId(channel.channelId);

  console.log(
    `[INFO] channel=${channelTitle || channel.channelName}, ` +
    `uploadsPlaylistId=${uploadsPlaylistId}`
  );

  const {
    ids,
    playlistItemsById,
  } = await fetchAllUploads(
    uploadsPlaylistId,
    channel.channelId
  );

  stats.uploadPlaylistItems += ids.length;

  const fetchedAt = new Date().toISOString();
  const newRecords = [];
  const yearCounts = new Map();

  const batchCount = Math.ceil(
    ids.length / VIDEO_BATCH_SIZE
  );

  for (
    let offset = 0;
    offset < ids.length;
    offset += VIDEO_BATCH_SIZE
  ) {
    const batch = ids.slice(
      offset,
      offset + VIDEO_BATCH_SIZE
    );

    const batchNo =
      Math.floor(offset / VIDEO_BATCH_SIZE) + 1;

    const videoDetailsById =
      await fetchVideoDetailsBatch(
        batch,
        channel.channelId
      );

    for (const videoId of batch) {
      const playlistItem =
        playlistItemsById.get(videoId);

      const video =
        videoDetailsById.get(videoId);

      if (!video) {
        stats.unavailableOrInaccessible += 1;

        stats.failedVideos.push({
          videoId,
          title: playlistItem?.title || '(title unavailable)',
          published: playlistItem?.published || '',
          reason:
            'Videos API returned no item ' +
            '(deleted, private, or inaccessible)',
        });

        continue;
      }

      if (
        video.snippet?.channelId &&
        video.snippet.channelId !== channel.channelId
      ) {
        stats.wrongChannel += 1;
        stats.excludedReasons.wrongChannel += 1;
        continue;
      }

      const record = makeMasterRecord(
        video,
        playlistItem || {},
        channel,
        fetchedAt
      );

      const existing = existingById.get(videoId);

      if (!isCompletedStream(record)) {
        stats.notCompletedStream += 1;

        stats.excludedReasons.missingActualStartOrEnd =
          (stats.excludedReasons.missingActualStartOrEnd || 0) + 1;

        continue;
      }

      if (!['public', 'unlisted'].includes(record.visibility)) {
        const reason = `visibility:${record.visibility}`;

        stats.excludedReasons[reason] =
          (stats.excludedReasons[reason] || 0) + 1;

        continue;
      }

      if (existing) {
        // 既存レコードの値を優先し、空欄のみAPI取得値で補完する。
        const merged = {
          ...record,
          ...existing,
        };

        for (const [key, value] of Object.entries(record)) {
          if (
            (
              merged[key] === '' ||
              merged[key] === undefined ||
              merged[key] === null
            ) &&
            value !== ''
          ) {
            merged[key] = value;
          }
        }

        existingById.set(videoId, merged);
        stats.duplicates += 1;
      } else {
        existingById.set(videoId, record);
        newRecords.push(record);
        stats.inserted += 1;
      }

      const year = getYear(record.actualStartTime);

      yearCounts.set(
        year,
        (yearCounts.get(year) || 0) + 1
      );
    }

    console.log(
      `[FETCH] ${channel.channelId}: ` +
      `video details batch ${batchNo}/${batchCount} ` +
      `(${batch.length} IDs)`
    );
  }

  for (const [year, count] of yearCounts.entries()) {
    stats.byYear[year] =
      (stats.byYear[year] || 0) + count;
  }

  console.log(
    `[SUMMARY] ${channel.channelName}: ` +
    `playlist=${ids.length}, ` +
    `newlyAdded=${newRecords.length}, ` +
    `totalCompletedEligibleSeen=` +
    `${[...yearCounts.values()].reduce((sum, n) => sum + n, 0)}`
  );

  return newRecords;
}

async function main() {
  const startedAt = Date.now();

  // APIキーの存在を先に確認する。
  getApiKey();

  const channels = await readJsonStrict(
    CHANNELS_PATH,
    []
  );

  if (channels.length === 0) {
    throw new Error(
      `${CHANNELS_PATH} にチャンネルがありません。` +
      `既存データを変更せず終了します。`
    );
  }

  // JSONを検証してからAPI取得を開始する。
  // 不正なJSONを空配列で置き換えない。
  const existingRecords = await readJsonStrict(
    STREAMS_MASTER_PATH,
    []
  );

  const existingById = new Map();

  for (const row of existingRecords) {
    if (
      !row ||
      typeof row.videoId !== 'string' ||
      !row.videoId.trim()
    ) {
      throw new Error(
        `${STREAMS_MASTER_PATH} に videoId のないレコードがあります。` +
        `既存データを変更せず終了します。`
      );
    }

    if (!existingById.has(row.videoId)) {
      existingById.set(row.videoId, row);
    }
  }

  const stats = {
    channels: channels.length,
    uploadPlaylistItems: 0,
    inserted: 0,
    duplicates: 0,
    unavailableOrInaccessible: 0,
    notCompletedStream: 0,
    wrongChannel: 0,
    excludedReasons: {},
    byYear: {},
    failedVideos: [],
  };

  console.log('=== buildStreamsMaster.js START ===');
  console.log(
    `開始時刻: ${new Date(startedAt).toISOString()}`
  );
  console.log(
    `既存 streamsMaster レコード数: ${existingRecords.length}`
  );

  for (const channel of channels) {
    if (!channel?.channelId) {
      throw new Error(
        `${CHANNELS_PATH} に channelId がないレコードがあります。` +
        `既存データを変更せず終了します。`
      );
    }

    await processChannel(
      channel,
      existingById,
      stats
    );
  }

  const finalRecords = [...existingById.values()].sort(
    (a, b) => {
      const aTime =
        Date.parse(a.actualStartTime || a.published || '') || 0;

      const bTime =
        Date.parse(b.actualStartTime || b.published || '') || 0;

      return (
        aTime - bTime ||
        a.videoId.localeCompare(b.videoId)
      );
    }
  );

  // 全チャンネル・全ページ・全バッチが正常終了した場合のみ保存する。
  await writeJsonAtomically(
    STREAMS_MASTER_PATH,
    finalRecords
  );

  const startTimes = finalRecords
    .map((row) => Date.parse(row.actualStartTime || ''))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const report = {
    ...stats,
    existingAtStart: existingRecords.length,
    finalMasterRecords: finalRecords.length,

    oldestActualStartTime: startTimes.length
      ? new Date(startTimes[0]).toISOString()
      : null,

    newestActualStartTime: startTimes.length
      ? new Date(startTimes.at(-1)).toISOString()
      : null,

    elapsedSeconds: Number(
      ((Date.now() - startedAt) / 1_000).toFixed(1)
    ),
  };

  console.log('\n=== buildStreamsMaster.js SUMMARY ===');
  console.log(JSON.stringify(report, null, 2));

  console.log(
    `更新完了: ${STREAMS_MASTER_PATH} ` +
    `(${finalRecords.length} records)`
  );

  if (stats.failedVideos.length > 0) {
    console.warn(
      '[WARNING] APIから詳細を取得できなかった動画があります。'
    );

    for (const item of stats.failedVideos) {
      console.warn(
        `[UNAVAILABLE] ${item.videoId} | ` +
        `${item.published || 'date unknown'} | ` +
        `${item.title} | ${item.reason}`
      );
    }
  }

  console.log(
    '注: YouTube Data API は過去のメンバー限定配信であるかを' +
    '確実に識別する専用フィールドを提供しません。' +
    'Uploads Playlist / Videos API から取得でき、' +
    'public または unlisted として返る完了済み配信を収録しています。'
  );

  console.log('=== buildStreamsMaster.js END ===');
}

main().catch((error) => {
  console.error(
    '[FATAL] buildStreamsMaster.js を中断しました。' +
    'streamsMaster.json は更新していません。'
  );

  console.error(error?.stack || error);
  process.exitCode = 1;
});
