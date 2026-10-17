import fs from 'node:fs/promises';
import path from 'node:path';

const CHANNELS_PATH = path.resolve('data/channels.json');
const STREAMS_MASTER_PATH = path.resolve('data/streamsMaster.json');
const HISTORY_PATH = path.resolve('data/randomStreamHistory.json');

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const TARGET_CHANNEL_ID = 'UCeGpWQL4CSiOFe96wDfOEAQ';

const DAILY_PICK_COUNT = 2;
const HISTORY_RETENTION_DAYS = 90;
const VIDEO_BATCH_SIZE = 50;
const HTTP_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

// Discord webhook secrets used by the existing notifier.
const WEBHOOK_ENV_NAMES = [
  'DISCORD_WEBHOOK_URL_FOR_ME',
  'DISCORD_WEBHOOK_URL_FOR_SODA',
];

// DRY_RUN=true: select and log candidates without posting or updating history.
const DRY_RUN = process.env.DRY_RUN === 'true';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJsonArray(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));

    if (!Array.isArray(parsed)) {
      throw new Error(`${filePath} must contain a JSON array.`);
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

async function readHistory(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));

    if (!parsed || !Array.isArray(parsed.sentDates)) {
      throw new Error('Expected an object containing sentDates.');
    }

    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        retentionDays: HISTORY_RETENTION_DAYS,
        sentDates: [],
      };
    }

    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

async function writeJsonAtomically(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });

    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});

    throw new Error(`Failed to write ${filePath}: ${error.message}`);
  }
}

function getTodayJST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function jstDateOffset(dateString, offsetDays) {
  const [year, month, day] = dateString.split('-').map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

function formatDateJST(value) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return '日付不明';
  }

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  const year = get('year');
  const month = get('month');
  const day = get('day');

  if (!year || !month || !day) {
    return '日付不明';
  }

  return `${year}/${month}/${day}`;
}

function shuffle(values) {
  const result = [...values];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function videoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function isMembersOnlyTitle(title) {
  return /メン限|メンバー限定|members[\s_-]*only/i.test(title || '');
}

function getEligibleMasterRecords(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    if (!row || typeof row.videoId !== 'string' || !row.videoId.trim()) {
      continue;
    }

    if (seen.has(row.videoId)) {
      continue;
    }

    seen.add(row.videoId);

    // Only completed archives with both actual timestamps.
    if (!row.title || !row.actualStartTime || !row.actualEndTime) {
      continue;
    }

    // Preserve the visibility restrictions of the master.
    if (!['public', 'unlisted'].includes(row.visibility)) {
      continue;
    }

    if (isMembersOnlyTitle(row.title)) {
      continue;
    }

    result.push(row);
  }

  return result;
}

function getRecentSentIds(history, today) {
  const cutoff = jstDateOffset(today, -(HISTORY_RETENTION_DAYS - 1));

  const retained = (history.sentDates || []).filter(
    (entry) =>
      entry &&
      typeof entry.dateJST === 'string' &&
      entry.dateJST >= cutoff &&
      entry.dateJST <= today &&
      Array.isArray(entry.videoIds),
  );

  return {
    retained,
    ids: new Set(retained.flatMap((entry) => entry.videoIds)),
  };
}

function getApiKey() {
  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    throw new Error('YOUTUBE_API_KEY is not set.');
  }

  return key;
}

async function getCurrentAccessibleVideos(videoIds) {
  const url = new URL(`${API_BASE_URL}/videos`);

  url.searchParams.set('part', 'snippet,status');

  url.searchParams.set('id', videoIds.join(','));

  url.searchParams.set(
    'fields',
    'items(id,snippet(title,channelId),status(privacyStatus))',
  );

  url.searchParams.set('key', getApiKey());

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    let response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;

      if (attempt === MAX_RETRIES) {
        break;
      }

      await sleep(500 * (2 ** (attempt - 1)));

      continue;
    }

    const responseText = await response.text();

    let data;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = {};
    }

    if (response.ok) {
      return data.items || [];
    }

    lastError = new Error(
      `YouTube Videos API HTTP ${response.status}: ` +
        `${data?.error?.message || responseText || response.statusText}`,
    );

    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;

    if (!retryable || attempt === MAX_RETRIES) {
      break;
    }

    const retryAfter = Number(response.headers.get('retry-after') || 0);

    await sleep(
      retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** (attempt - 1)),
    );
  }

  throw lastError || new Error('YouTube Videos API request failed.');
}

async function selectTwoCurrentlyAccessible(masterCandidates) {
  const shuffled = shuffle(masterCandidates);
  const selected = [];

  for (let offset = 0; offset < shuffled.length; offset += VIDEO_BATCH_SIZE) {
    const batch = shuffled.slice(offset, offset + VIDEO_BATCH_SIZE);

    const items = await getCurrentAccessibleVideos(
      batch.map((row) => row.videoId),
    );

    const currentById = new Map(items.map((item) => [item.id, item]));

    for (const row of batch) {
      const current = currentById.get(row.videoId);

      // Exclude videos that the API no longer returns.
      if (!current) {
        continue;
      }

      // Confirm that the video belongs to the target channel.
      if (current.snippet?.channelId !== TARGET_CHANNEL_ID) {
        continue;
      }

      // Exclude videos that are currently private or otherwise
      // outside the allowed visibility conditions.
      if (!['public', 'unlisted'].includes(current.status?.privacyStatus)) {
        continue;
      }

      const title = current.snippet?.title || row.title;

      if (isMembersOnlyTitle(title)) {
        continue;
      }

      selected.push({
        ...row,
        title,
        visibility: current.status.privacyStatus,
      });

      if (selected.length === DAILY_PICK_COUNT) {
        return selected;
      }
    }

    console.log(
      `[CHECK] checked=${Math.min(offset + batch.length, shuffled.length)}/${shuffled.length}, ` +
        `accessible=${selected.length}`,
    );
  }

  return selected;
}

function getWebhookUrls() {
  const urls = WEBHOOK_ENV_NAMES.map((name) => {
    const url = process.env[name];

    if (!url) {
      throw new Error(`Required GitHub Secret ${name} is not configured.`);
    }

    return url;
  });

  // Avoid posting twice if both variables happen to contain
  // the same webhook URL.
  return [...new Set(urls)];
}

function buildDiscordPayload(channel, selected, today) {
  const displayToday = today.replace(/-/g, '/');

  const embeds = selected.map((row) => ({
    // Clickable archive title.
    title: String(row.title).slice(0, 256),
    url: videoUrl(row.videoId),

    // Use the larger sddefault thumbnail image.
    // Embed image appears below the title.
    image: {
      url: `https://i.ytimg.com/vi/${row.videoId}/sddefault.jpg`,
    },

    // Show the date only. Do not show start/end times,
    // duration, or recommendation numbering.
    footer: {
      text: `配信日：${formatDateJST(row.actualStartTime)}`,
    },
  }));

  return {
    username: channel.channelName || 'シン・ワシソダ通知er',

    ...(channel.channelIconUrl ? { avatar_url: channel.channelIconUrl } : {}),

    tts: false,

    content:
      `🎲**本日（${displayToday}）の配信アーカイブ紹介**🎲` +
      '\n\n' +
      '本日も2本、曽田すかい＠ワシソダchの' +
      '配信アーカイブの紹介ソダ～👍️',

    // Suppress push notifications where Discord supports it.
    flags: 4096,

    allowed_mentions: {
      parse: [],
    },

    embeds,
  };
}

async function postToDiscord(webhookUrl, payload) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (response.ok) {
      return;
    }

    const responseText = await response.text();

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after') || 1);

      console.warn(`Discord rate limited; waiting ${retryAfter}s.`);

      await sleep(retryAfter * 1000);
      continue;
    }

    const retryable = response.status === 408 || response.status >= 500;

    if (retryable && attempt < MAX_RETRIES) {
      await sleep(500 * (2 ** (attempt - 1)));

      continue;
    }

    throw new Error(
      `Discord webhook failed: HTTP ${response.status} ` + `${responseText}`,
    );
  }

  throw new Error('Discord webhook request failed after retries.');
}

async function main() {
  const today = getTodayJST();

  // Read-only inputs: neither streamsMaster.json nor
  // videoData.json is modified by this script.
  const channels = await readJsonArray(CHANNELS_PATH);

  const masterRows = await readJsonArray(STREAMS_MASTER_PATH);

  const history = await readHistory(HISTORY_PATH);

  const channel = channels.find((item) => item?.channelId === TARGET_CHANNEL_ID);

  if (!channel) {
    throw new Error(
      `Target channel ${TARGET_CHANNEL_ID} ` +
        'was not found in channels.json.',
    );
  }

  const { retained, ids: recentSentIds } = getRecentSentIds(history, today);

  const alreadySentToday = retained.some((entry) => entry.dateJST === today);

  if (alreadySentToday && !DRY_RUN) {
    console.log(
      `A recommendation has already been sent for ${today} JST. ` +
        'Skipping duplicate run.',
    );

    return;
  }

  const eligible = getEligibleMasterRecords(masterRows);

  const candidates = eligible.filter((row) => !recentSentIds.has(row.videoId));

  console.log(`JST date: ${today}`);
  console.log(`streamsMaster records: ${masterRows.length}`);

  console.log(`Eligible completed archives: ${eligible.length}`);

  console.log(
    `Excluded by ${HISTORY_RETENTION_DAYS}-day history: ` +
      `${eligible.length - candidates.length}`,
  );

  console.log(`Candidates to check: ${candidates.length}`);

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  if (candidates.length < DAILY_PICK_COUNT) {
    throw new Error(
      `Only ${candidates.length} candidates remain ` +
        'after de-duplication. ' +
        `Exactly ${DAILY_PICK_COUNT} are required. ` +
        'No post was sent.',
    );
  }

  const selected = await selectTwoCurrentlyAccessible(candidates);

  if (selected.length !== DAILY_PICK_COUNT) {
    throw new Error(
      `Only ${selected.length} currently accessible ` +
        'eligible videos found. ' +
        `Exactly ${DAILY_PICK_COUNT} are required. ` +
        'No post was sent.',
    );
  }

  console.log('=== Selected recommendations ===');

  for (const [index, row] of selected.entries()) {
    console.log(
      `${index + 1}. ${row.title}\n` +
        `   ${videoUrl(row.videoId)}\n` +
        `   配信日：${formatDateJST(row.actualStartTime)}`,
    );
  }

  if (DRY_RUN) {
    console.log(
      'DRY_RUN enabled: skipping Discord delivery ' + 'and history update.',
    );

    return;
  }

  const payload = buildDiscordPayload(channel, selected, today);

  const webhookUrls = getWebhookUrls();

  for (const [index, webhookUrl] of webhookUrls.entries()) {
    await postToDiscord(webhookUrl, payload);

    console.log(
      `Discord webhook ${index + 1}/${webhookUrls.length} succeeded.`,
    );

    if (index < webhookUrls.length - 1) {
      await sleep(1_000);
    }
  }

  const cutoff = jstDateOffset(today, -(HISTORY_RETENTION_DAYS - 1));

  const sentDates = [
    ...retained.filter(
      (entry) => entry.dateJST >= cutoff && entry.dateJST < today,
    ),

    {
      dateJST: today,
      sentAt: new Date().toISOString(),
      videoIds: selected.map((row) => row.videoId),
    },
  ];

  await writeJsonAtomically(HISTORY_PATH, {
    retentionDays: HISTORY_RETENTION_DAYS,
    sentDates,
  });

  console.log(
    `Posted one message containing ${selected.length} embeds ` +
      `to ${webhookUrls.length} webhook(s).`,
  );

  console.log(
    `${HISTORY_PATH} updated; selected IDs will be excluded ` +
      `from recommendations for ${HISTORY_RETENTION_DAYS} days.`,
  );
}

main().catch((error) => {
  console.error('[FATAL] dailyStreamRecommendation.js failed.');

  console.error(error?.stack || error);

  process.exitCode = 1;
});
