import fs from 'node:fs/promises';

const CHANNELS_PATH = 'data/channels.json';
const VIDEO_DATA_PATH = 'data/videoData.json';

const YOUTUBE_RSS_PREFIX = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const DISCORD_MIN_INTERVAL_MS = 3000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readJson(path, fallback) {
  try {
    const text = await fs.readFile(path, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await fs.writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTagText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? match[1].trim() : '';
}

function parseYouTubeFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  return entries.slice(0, 5).map(entryMatch => {
    const entry = entryMatch[1];

    return {
      title: getTagText(entry, 'title'),
      updated: getTagText(entry, 'updated'),
      published: getTagText(entry, 'published'),
      videoId: getTagText(entry, 'yt:videoId'),
      source: 'rss'
    };
  }).filter(item => item.videoId);
}

function formatDateForMessage(dateString, mode = 'datetime') {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: mode === 'time' ? undefined : '2-digit',
    day: mode === 'time' ? undefined : '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return formatter.format(date);
}

function convertDurationToHHMMSS(duration) {
  if (!duration || typeof duration !== 'string') return '00:00:00';
  if (duration === 'P0D' || duration === 'PT0S') return '00:00:00';

  const matches = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!matches) return '00:00:00';

  const days = matches[1] ? Number.parseInt(matches[1], 10) : 0;
  const hours = matches[2] ? Number.parseInt(matches[2], 10) : 0;
  const minutes = matches[3] ? Number.parseInt(matches[3], 10) : 0;
  const seconds = matches[4] ? Number.parseInt(matches[4], 10) : 0;
  const totalHours = days * 24 + hours;

  return String(totalHours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0');
}

function getYouTubeVideoUrl(videoId) {
  return 'https://www.youtube.com/watch?v=' + videoId;
}

function getYouTubeThumbnailUrl(videoId) {
  return 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
}

function getYouTubeChannelUrl(channelId) {
  return 'https://www.youtube.com/channel/' + channelId;
}

function buildDescription(liveBroadcastContent, time, duration) {
  if (liveBroadcastContent === 'upcoming') {
    const formatted = formatDateForMessage(time, 'datetime');
    return formatted ? `${formatted}から配信予定！` : '配信予定！';
  }

  if (liveBroadcastContent === 'live') {
    const formatted = formatDateForMessage(time, 'time');
    return formatted ? `${formatted}から配信中！` : '配信中！';
  }

  if (liveBroadcastContent === 'archive') {
    return `アーカイブはこちら\n配信時間 ${duration || '00:00:00'}`;
  }

  if (liveBroadcastContent === 'video') {
    return `動画が投稿されました\n動画時間 ${duration || '00:00:00'}`;
  }

  return 'new content!';
}

function getSortTime(videoInfo, item) {
  return videoInfo.actualStartTime ||
    videoInfo.scheduledStartTime ||
    item.published ||
    item.updated ||
    new Date().toISOString();
}

async function fetchLatestItems(channelId) {
  const rssUrl = YOUTUBE_RSS_PREFIX + channelId;

  try {
    const response = await fetch(rssUrl);

    if (response.ok) {
      const xml = await response.text();
      return parseYouTubeFeed(xml);
    }

    console.error(`RSS取得に失敗しました。channelId=${channelId}, HTTP ${response.status}`);
  } catch (error) {
    console.error(`RSS取得中にエラー: ${error.message}`);
  }

  return fetchLatestItemsByYouTubeApi(channelId);
}

async function fetchLatestItemsByYouTubeApi(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY が設定されていません。RSS取得失敗時のfallbackに必要です。');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('order', 'date');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('fields', 'items(id(videoId),snippet(title,publishedAt))');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube Search APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`);
  }

  return (data.items || []).map(item => ({
    title: item.snippet.title,
    updated: item.snippet.publishedAt,
    published: item.snippet.publishedAt,
    videoId: item.id.videoId,
    source: 'youtubeApi'
  })).filter(item => item.videoId);
}

async function fetchVideoInfo(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY が設定されていません。動画詳細取得に必要です。');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'id,snippet,liveStreamingDetails,contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('fields', 'items(id,snippet(liveBroadcastContent,title),liveStreamingDetails(scheduledStartTime,actualStartTime,actualEndTime),contentDetails(duration))');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube Videos APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`);
  }

  if (!data.items || data.items.length === 0) {
    throw new Error(`動画情報が見つかりませんでした: ${videoId}`);
  }

  const item = data.items[0];
  const details = item.liveStreamingDetails;

  let liveBroadcastContent = 'video';

  if (details) {
    if (details.actualEndTime) {
      liveBroadcastContent = 'archive';
    } else if (details.actualStartTime) {
      liveBroadcastContent = 'live';
    } else if (details.scheduledStartTime) {
      liveBroadcastContent = 'upcoming';
    }
  }

  return {
    title: item.snippet.title,
    liveBroadcastContent,
    scheduledStartTime: details?.scheduledStartTime || '',
    actualStartTime: details?.actualStartTime || '',
    actualEndTime: details?.actualEndTime || '',
    duration: item.contentDetails?.duration || 'PT0S'
  };
}

function getWebhookUrl(channel) {
  const secretName = channel.discordWebhookSecretName || 'DISCORD_WEBHOOK_URL';
  const webhookUrl = process.env[secretName];

  if (!webhookUrl) {
    throw new Error(`GitHub Secret ${secretName} が設定されていません。`);
  }

  return webhookUrl;
}

async function postToDiscord(channel, video, description, isInitialTest = false) {
  const webhookUrl = getWebhookUrl(channel);
  const videoUrl = getYouTubeVideoUrl(video.videoId);

  const body = {
    username: channel.channelName,
    avatar_url: channel.channelIconUrl || undefined,
    tts: false,
    content: videoUrl,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: video.title,
        description: isInitialTest ? `[初回テスト通知]\n${description}` : description,
        url: videoUrl,
        color: 16724889,
        timestamp: new Date(video.sortTime).toISOString(),
        image: {
          url: getYouTubeThumbnailUrl(video.videoId)
        },
        author: {
          name: channel.channelName,
          url: getYouTubeChannelUrl(channel.channelId)
        }
      }
    ]
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 10);
    console.error(`Discord rate limit。${retryAfter}秒待機します。`);
    await sleep(retryAfter * 1000);
    return false;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord投稿失敗: HTTP ${response.status} ${text}`);
  }

  await sleep(DISCORD_MIN_INTERVAL_MS);
  return true;
}

async function main() {
  const channels = await readJson(CHANNELS_PATH, []);
  const videoData = await readJson(VIDEO_DATA_PATH, []);

  const knownVideoIds = new Set(videoData.map(row => row.videoId));
  const isInitialRun = videoData.length === 0;

  let newRows = [];
  let initialTestPosted = false;

  for (const channel of channels) {
    console.log(`処理開始: ${channel.channelName}`);

    const items = await fetchLatestItems(channel.channelId);
    const candidates = [];

    for (const item of items) {
      if (knownVideoIds.has(item.videoId)) {
        continue;
      }

      const info = await fetchVideoInfo(item.videoId);
      const duration = convertDurationToHHMMSS(info.duration);
      const sortTime = getSortTime(info, item);

      const row = {
        title: item.title || info.title,
        published: item.published,
        updated: item.updated,
        videoId: item.videoId,
        channel: channel.channelName,
        live: info.liveBroadcastContent,
        scheduledStartTime: info.scheduledStartTime,
        actualStartTime: info.actualStartTime,
        duration,
        sortTime
      };

      candidates.push(row);
      knownVideoIds.add(item.videoId);
    }

    candidates.sort((a, b) => new Date(a.sortTime) - new Date(b.sortTime));
    newRows.push(...candidates);

    if (isInitialRun && !initialTestPosted && candidates.length > 0) {
      const latest = candidates[candidates.length - 1];
      const description = buildDescription(latest.live, latest.actualStartTime || latest.scheduledStartTime || latest.sortTime, latest.duration);
      const posted = await postToDiscord(channel, latest, description, true);
      initialTestPosted = posted;
    }

    if (!isInitialRun) {
      for (const video of candidates) {
        const description = buildDescription(video.live, video.actualStartTime || video.scheduledStartTime || video.sortTime, video.duration);
        await postToDiscord(channel, video, description, false);
      }
    }
  }

  if (newRows.length > 0) {
    const merged = [...videoData, ...newRows]
      .sort((a, b) => new Date(a.sortTime) - new Date(b.sortTime));

    await writeJson(VIDEO_DATA_PATH, merged);
    console.log(`${newRows.length}件の動画情報を保存しました。`);
  } else {
    console.log('新規動画はありません。');
  }

  if (isInitialRun) {
    console.log(`初回実行: 新規登録 ${newRows.length}件、テスト通知 ${initialTestPosted ? '成功' : '未送信または失敗'}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
