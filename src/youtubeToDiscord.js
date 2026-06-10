import fs from 'node:fs/promises';

const CHANNELS_PATH = 'data/channels.json';
const VIDEO_DATA_PATH = 'data/videoData.json';

const YOUTUBE_RSS_PREFIX =
  'https://www.youtube.com/feeds/videos.xml?channel_id=';

const DISCORD_MIN_INTERVAL_MS = 3000;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function readJson(path, fallback) {
  try {
    const text = await fs.readFile(path, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await fs.writeFile(
    path,
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  );
}

function getTagText(xml, tagName) {
  const match = xml.match(
    new RegExp(
      `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`
    )
  );

  return match ? match[1].trim() : '';
}

function parseYouTubeFeed(xml) {
  const entries = [
    ...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)
  ];

  return entries
    .slice(0, 5)
    .map(entryMatch => {
      const entry = entryMatch[1];

      return {
        title: getTagText(entry, 'title'),
        updated: getTagText(entry, 'updated'),
        published: getTagText(entry, 'published'),
        videoId: getTagText(entry, 'yt:videoId'),
        source: 'rss'
      };
    })
    .filter(item => item.videoId);
}

function formatDateForMessage(dateString) {
  if (!dateString) {
    return '';
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter =
    new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

  return formatter.format(date);
}

function convertDurationToHHMMSS(duration) {
  if (!duration || typeof duration !== 'string') {
    return '00:00:00';
  }

  if (
    duration === 'P0D' ||
    duration === 'PT0S'
  ) {
    return '00:00:00';
  }

  const matches = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );

  if (!matches) {
    return '00:00:00';
  }

  const days = matches[1]
    ? Number.parseInt(matches[1], 10)
    : 0;

  const hours = matches[2]
    ? Number.parseInt(matches[2], 10)
    : 0;

  const minutes = matches[3]
    ? Number.parseInt(matches[3], 10)
    : 0;

  const seconds = matches[4]
    ? Number.parseInt(matches[4], 10)
    : 0;

  const totalHours =
    days * 24 + hours;

  return (
    String(totalHours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0')
  );
}

function getYouTubeVideoUrl(videoId) {
  return (
    'https://www.youtube.com/watch?v=' +
    videoId
  );
}

function getYouTubeThumbnailUrl(videoId) {
  return (
    'https://i.ytimg.com/vi/' +
    videoId +
    '/sddefault.jpg'
  );
}

function getYouTubeChannelUrl(channelId) {
  return (
    'https://www.youtube.com/channel/' +
    channelId
  );
}

async function fetchLatestItems(channelId) {
  const rssUrl =
    YOUTUBE_RSS_PREFIX + channelId;

  try {
    const response =
      await fetch(rssUrl);

    if (response.ok) {
      const xml =
        await response.text();

      return parseYouTubeFeed(xml);
    }

    console.error(
      `RSS取得に失敗しました。channelId=${channelId}, HTTP ${response.status}`
    );
  } catch (error) {
    console.error(
      `RSS取得中にエラー: ${error.message}`
    );
  }

  return fetchLatestItemsByYouTubeApi(
    channelId
  );
}

async function fetchLatestItemsByYouTubeApi(
  channelId
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY が設定されていません。'
    );
  }

  const url = new URL(
    'https://www.googleapis.com/youtube/v3/search'
  );

  url.searchParams.set(
    'part',
    'snippet'
  );

  url.searchParams.set(
    'channelId',
    channelId
  );

  url.searchParams.set(
    'order',
    'date'
  );

  url.searchParams.set(
    'type',
    'video'
  );

  url.searchParams.set(
    'maxResults',
    '5'
  );

  url.searchParams.set(
    'fields',
    'items(id(videoId),snippet(title,publishedAt))'
  );

  url.searchParams.set(
    'key',
    apiKey
  );

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `YouTube Search APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return (data.items || [])
    .map(item => ({
      title:
        item.snippet.title,

      updated:
        item.snippet.publishedAt,

      published:
        item.snippet.publishedAt,

      videoId:
        item.id.videoId,

      source:
        'youtubeApi'
    }))
    .filter(
      item => item.videoId
    );
}

async function fetchVideoInfo(
  videoId
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY が設定されていません。'
    );
  }

  const url = new URL(
    'https://www.googleapis.com/youtube/v3/videos'
  );

  url.searchParams.set(
    'part',
    'id,snippet,liveStreamingDetails,contentDetails'
  );

  url.searchParams.set(
    'id',
    videoId
  );

  url.searchParams.set(
    'fields',
    'items(id,snippet(title),liveStreamingDetails(scheduledStartTime,actualStartTime,actualEndTime),contentDetails(duration))'
  );

  url.searchParams.set(
    'key',
    apiKey
  );

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `YouTube Videos APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  if (
    !data.items ||
    data.items.length === 0
  ) {
    throw new Error(
      `動画情報が見つかりませんでした: ${videoId}`
    );
  }

  const item =
    data.items[0];

  const details =
    item.liveStreamingDetails;

  let liveBroadcastContent =
    'video';

  if (details) {
    if (
      details.actualEndTime
    ) {
      liveBroadcastContent =
        'archive';
    } else if (
      details.actualStartTime
    ) {
      liveBroadcastContent =
        'live';
    } else if (
      details.scheduledStartTime
    ) {
      liveBroadcastContent =
        'upcoming';
    }
  }

  return {
    title:
      item.snippet.title,

    liveBroadcastContent,

    scheduledStartTime:
      details?.scheduledStartTime ||
      '',

    actualStartTime:
      details?.actualStartTime ||
      '',

    actualEndTime:
      details?.actualEndTime ||
      '',

    duration:
      item.contentDetails
        ?.duration ||
      'PT0S'
  };
}

function getWebhookUrl(
  channel
) {
  const secretName =
    channel.discordWebhookSecretName ||
    'DISCORD_WEBHOOK_URL';

  const webhookUrl =
    process.env[
      secretName
    ];

  if (!webhookUrl) {
    throw new Error(
      `GitHub Secret ${secretName} が設定されていません。`
    );
  }

  return webhookUrl;
}

function buildNotificationMessage(
  video
) {
  const title =
    `**${video.title}**`;

  if (
    video.live ===
    'upcoming'
  ) {
    const time =
      formatDateForMessage(
        video.scheduledStartTime
      );

    return `${time}に
${title}
が配信開始予定ソダ～。`;
  }

  if (
    video.live ===
    'live'
  ) {
    const time =
      formatDateForMessage(
        video.actualStartTime
      );

    return `${time}に
${title}
が配信開始されたソダ～。`;
  }

  if (
    video.live ===
    'archive'
  ) {
    const time =
      formatDateForMessage(
        video.actualEndTime ||
        video.actualStartTime ||
        video.sortTime
      );

    return `${time}に
    
${title}

が配信終了したソダ～。`;
  }

  const time =
    formatDateForMessage(
      video.published ||
      video.updated ||
      video.sortTime
    );

  return `${time}に
${title}
が投稿されたソダ～。`;
}

async function postToDiscord(
  channel,
  video,
  isInitialTest = false
) {
  const webhookUrl =
    getWebhookUrl(channel);

  const videoUrl =
    getYouTubeVideoUrl(
      video.videoId
    );

  const thumbnailUrl =
    getYouTubeThumbnailUrl(
      video.videoId
    );

  const message =
    buildNotificationMessage(
      video
    );

  const content =
    isInitialTest
      ? `【初回テスト通知】
${message}`
      : message;

  const body = {
    username:
      channel.channelName,

    avatar_url:
      channel.channelIconUrl ||
      undefined,

    tts: false,

    content,

    allowed_mentions: {
      parse: []
    },

    embeds: [
      {
        author: {
          name:
            videoUrl,
          url:
            videoUrl
        },

        url:
          videoUrl,

        image: {
          url:
            thumbnailUrl
        },

        color:
          16777215
      }
    ]
  };

  const response =
    await fetch(
      webhookUrl,
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/json'
        },

        body:
          JSON.stringify(
            body
          )
      }
    );

  if (
    response.status ===
    429
  ) {
    const retryAfter =
      Number(
        response.headers.get(
          'retry-after'
        ) || 10
      );

    console.error(
      `Discord rate limit。${retryAfter}秒待機します。`
    );

    await sleep(
      retryAfter * 1000
    );

    return false;
  }

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Discord投稿失敗: HTTP ${response.status} ${text}`
    );
  }

  await sleep(
    DISCORD_MIN_INTERVAL_MS
  );

  return true;
}

function createVideoState(
  channel,
  item,
  info
) {
  return {
    videoId:
      item.videoId,

    title:
      item.title ||
      info.title,

    channel:
      channel.channelName,

    live:
      info.liveBroadcastContent,

    published:
      item.published,

    updated:
      item.updated,

    scheduledStartTime:
      info.scheduledStartTime,

    actualStartTime:
      info.actualStartTime,

    actualEndTime:
      info.actualEndTime,

    duration:
      convertDurationToHHMMSS(
        info.duration
      ),

    notifiedUpcoming:
      false,

    notifiedLive:
      false,

    notifiedArchive:
      false,

    notifiedVideo:
      false
  };
}

async function main() {
  const channels =
    await readJson(
      CHANNELS_PATH,
      []
    );

  const videoData =
    await readJson(
      VIDEO_DATA_PATH,
      []
    );

  const isInitialRun =
    videoData.length === 0;

  let initialTestPosted =
    false;

  for (const channel of channels) {
    console.log(
      `処理開始: ${channel.channelName}`
    );

  let latestItems =
    await fetchLatestItems(
      channel.channelId
    );

  if (
    isInitialRun &&
    latestItems.length > 0
  ) {
    latestItems = [
      latestItems[0]
    ];
  }

    for (const item of latestItems) {
      const info =
        await fetchVideoInfo(
          item.videoId
        );

      let existing =
        videoData.find(
          row =>
            row.videoId ===
            item.videoId
        );

      if (!existing) {
        existing =
          createVideoState(
            channel,
            item,
            info
          );

        videoData.push(
          existing
        );
      }

      existing.live =
        info.liveBroadcastContent;

      existing.scheduledStartTime =
        info.scheduledStartTime;

      existing.actualStartTime =
        info.actualStartTime;

      existing.actualEndTime =
        info.actualEndTime;

      existing.duration =
        convertDurationToHHMMSS(
          info.duration
        );

      if (
        isInitialRun &&
        !initialTestPosted
      ) {
        await postToDiscord(
          channel,
          existing,
          true
        );

        initialTestPosted =
          true;

        switch (
          existing.live
        ) {
          case 'upcoming':
            existing.notifiedUpcoming =
              true;
            break;

          case 'live':
            existing.notifiedLive =
              true;
            break;

          case 'archive':
            existing.notifiedArchive =
              true;
            break;

          default:
            existing.notifiedVideo =
              true;
        }

        continue;
      }

      if (
        existing.live ===
          'video' &&
        !existing.notifiedVideo
      ) {
        await postToDiscord(
          channel,
          existing
        );

        existing.notifiedVideo =
          true;
      }

      if (
        existing.live ===
          'upcoming' &&
        !existing.notifiedUpcoming
      ) {
        await postToDiscord(
          channel,
          existing
        );

        existing.notifiedUpcoming =
          true;
      }

      if (
        existing.live ===
          'live' &&
        !existing.notifiedLive
      ) {
        await postToDiscord(
          channel,
          existing
        );

        existing.notifiedLive =
          true;
      }

      if (
        existing.live ===
          'archive' &&
        !existing.notifiedArchive
      ) {
        await postToDiscord(
          channel,
          existing
        );

        existing.notifiedArchive =
          true;
      }
    }
  }

  await writeJson(
    VIDEO_DATA_PATH,
    videoData
  );

  console.log(
    'videoData.json を更新しました。'
  );

  if (isInitialRun) {
    console.log(
      `初回実行: テスト通知 ${
        initialTestPosted
          ? '成功'
          : '未送信'
      }`
    );
  }
}

main().catch(error => {
  console.error(
    error
  );

  process.exitCode = 1;
});
