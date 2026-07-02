import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const CHANNELS_PATH =
  'data/channels.json';

const VIDEO_DATA_PATH =
  'data/videoData.json';

const WORKS_MASTER_URL =
  'https://raw.githubusercontent.com/xiang4ri4kui2/SodaCH-works-classifier/main/data/worksMaster.json';

const WORKS_MASTER_CACHE_PATH =
  'data/worksMasterCache.json';

const YOUTUBE_RSS_PREFIX =
  'https://www.youtube.com/feeds/videos.xml?channel_id=';

const DISCORD_MIN_INTERVAL_MS =
  3000;

const sleep = ms =>
  new Promise(resolve =>
    setTimeout(resolve, ms)
  );

async function readJson(
  path,
  fallback
) {
  try {
    const text =
      await fs.readFile(
        path,
        'utf8'
      );

    return JSON.parse(
      text
    );
  } catch {
    return fallback;
  }
}

async function writeJson(
  path,
  data
) {
  await fs.writeFile(
    path,
    JSON.stringify(
      data,
      null,
      2
    ) + '\n',
    'utf8'
  );
}

function getTagText(
  xml,
  tagName
) {
  const match =
    xml.match(
      new RegExp(
        `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`
      )
    );

  return match
    ? match[1].trim()
    : '';
}

function parseYouTubeFeed(
  xml
) {
  const entries = [
    ...xml.matchAll(
      /<entry>([\s\S]*?)<\/entry>/g
    )
  ];

  return entries
    .slice(0, 5)
    .map(entryMatch => {
      const entry =
        entryMatch[1];

      return {
        title:
          getTagText(
            entry,
            'title'
          ),

        updated:
          getTagText(
            entry,
            'updated'
          ),

        published:
          getTagText(
            entry,
            'published'
          ),

        videoId:
          getTagText(
            entry,
            'yt:videoId'
          ),

        source:
          'rss'
      };
    })
    .filter(
      item =>
        item.videoId
    );
}

function formatDateForMessage(
  dateString
) {
  if (
    !dateString
  ) {
    return '';
  }

  const date =
    new Date(
      dateString
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  const formatter =
    new Intl.DateTimeFormat(
      'ja-JP',
      {
        timeZone:
          'Asia/Tokyo',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false
      }
    );

  return formatter.format(
    date
  );
}

function convertDurationToHHMMSS(
  duration
) {
  if (
    !duration ||
    typeof duration !==
      'string'
  ) {
    return '00:00:00';
  }

  if (
    duration ===
      'P0D' ||
    duration ===
      'PT0S'
  ) {
    return '00:00:00';
  }

  const matches =
    duration.match(
      /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
    );

  if (
    !matches
  ) {
    return '00:00:00';
  }

  const days =
    matches[1]
      ? Number.parseInt(
          matches[1],
          10
        )
      : 0;

  const hours =
    matches[2]
      ? Number.parseInt(
          matches[2],
          10
        )
      : 0;

  const minutes =
    matches[3]
      ? Number.parseInt(
          matches[3],
          10
        )
      : 0;

  const seconds =
    matches[4]
      ? Number.parseInt(
          matches[4],
          10
        )
      : 0;

  const totalHours =
    days * 24 +
    hours;

  return (
    String(
      totalHours
    ).padStart(
      2,
      '0'
    ) +
    ':' +
    String(
      minutes
    ).padStart(
      2,
      '0'
    ) +
    ':' +
    String(
      seconds
    ).padStart(
      2,
      '0'
    )
  );
}

function getYouTubeVideoUrl(
  videoId
) {
  return (
    'https://www.youtube.com/watch?v=' +
    videoId
  );
}

function getYouTubeThumbnailUrl(
  videoId
) {
  return (
    'https://i.ytimg.com/vi/' +
    videoId +
    '/sddefault.jpg'
  );
}

// サムネイルハッシュ計算関数
async function downloadAndHashThumbnail(
  videoId
) {
  const thumbnailUrl =
    getYouTubeThumbnailUrl(
      videoId
    );

  try {
    const response =
      await fetch(
        thumbnailUrl
      );

    if (
      !response.ok
    ) {
      console.warn(
        `サムネイルダウンロード失敗: ${videoId} HTTP ${response.status}`
      );

      return null;
    }

    const buffer =
      await response.arrayBuffer();

    const hash =
      crypto
        .createHash('sha256')
        .update(
          Buffer.from(buffer)
        )
        .digest('hex');

    return hash;
  } catch (error) {
    console.warn(
      `サムネイルハッシュ計算エラー: ${error.message}`
    );

    return null;
  }
}

// サムネイル差し替え通知判定
function shouldNotifyThumbnailChange(
  existing,
  newHash
) {
  // 初回チェック
  if (
    !existing.thumbnailHash
  ) {
    return false;
  }

  // ハッシュ変わってない
  if (
    existing.thumbnailHash ===
    newHash
  ) {
    return false;
  }

  // ハッシュが変わった

  // archive または video のみ通知対象
  const isNotifiable =
    existing.live === 'archive' ||
    existing.live === 'video';

  if (
    isNotifiable
  ) {
    console.log(
      `サムネ差し替え検知（通知対象）: ` +
      `${existing.videoId} (${existing.live})`
    );

    return true;
  }

  // upcoming・live は無視
  console.log(
    `サムネ差し替え検知（無視）: ` +
    `${existing.videoId} (${existing.live})`
  );

  return false;
}

function findExisting(
  videoData,
  videoId
) {
  return videoData.find(
    row =>
      row.videoId ===
      videoId
  );
}

const VALID_TRANSITIONS = {
  upcoming: [
    'upcoming',
    'live',
    'archive'
  ],

  live: [
    'live',
    'archive'
  ],

  archive: [
    'archive'
  ],

  video: [
    'video'
  ]
};

function shouldProcessItem(
  existing,
  newLive
) {
  if (!existing) {
    return true;
  }

  const current =
    existing.live;

  const allowed =
    VALID_TRANSITIONS[
      current
    ] || [];

  return allowed.includes(
    newLive
  );
}

// RSS 取得（リトライ機構付き）
async function fetchLatestItems(
  channelId
) {
  const rssUrl =
    YOUTUBE_RSS_PREFIX +
    channelId;

  const maxRetries = 1;

  for (
    let attempt = 1;
    attempt <= maxRetries + 1;
    attempt++
  ) {

    try {
      const response =
        await fetch(
          rssUrl
        );

      if (
        response.ok
      ) {
        const xml =
          await response.text();

        return parseYouTubeFeed(
          xml
        );
      }

      // ステータスコード関わらず
      // 「エラーが発生した」と扱う
      console.warn(
        `RSS取得失敗: HTTP ${response.status}、` +
        (
          attempt === 1
            ? `500ms 後に再試行します`
            : `YouTube API へフォールバックします`
        )
      );

      if (attempt <= maxRetries) {
        await sleep(500);
        continue;
      }

    } catch (error) {
      console.warn(
        `RSS取得エラー: ${error.message}、` +
        (
          attempt === 1
            ? `500ms 後に再試行します`
            : `YouTube API へフォールバックします`
        )
      );

      if (attempt <= maxRetries) {
        await sleep(500);
        continue;
      }
    }
  }

  // RSS リトライ完了
  // → API へフォールバック
  console.warn(
    `RSS リトライ完了。YouTube API へフォールバックします。`
  );

  return fetchLatestItemsByYouTubeApi(
    channelId
  );
}

function getWebhookUrls(
  channel
) {
  const secretNames =
    channel.discordWebhookSecretNames ||
    [
      'DISCORD_WEBHOOK_URL_FOR_ME'
    ];

  const webhookUrls =
    secretNames.map(
      secretName => {
        const webhookUrl =
          process.env[
            secretName
          ];

        if (
          !webhookUrl
        ) {
          throw new Error(
            `GitHub Secret ${secretName} が設定されていません。`
          );
        }

        return webhookUrl;
      }
    );

  return webhookUrls;
}

async function fetchLatestItemsByYouTubeApi(
  channelId
) {
  const apiKey =
    process.env
      .YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY が設定されていません。'
    );
  }

  const url =
    new URL(
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
    await fetch(
      url
    );

  const data =
    await response.json();

  if (
    !response.ok
  ) {
    throw new Error(
      `YouTube Search APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return (
    data.items || []
  )
    .map(
      item => ({
        title:
          item.snippet
            .title,

        updated:
          item.snippet
            .publishedAt,

        published:
          item.snippet
            .publishedAt,

        videoId:
          item.id
            .videoId,

        source:
          'youtubeApi'
      })
    )
    .filter(
      item =>
        item.videoId
    );
}

async function fetchVideoInfo(
  videoId
) {
  const apiKey =
    process.env
      .YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY が設定されていません。'
    );
  }

  const url =
    new URL(
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
    await fetch(
      url
    );

  const data =
    await response.json();

  if (
    !response.ok
  ) {
    throw new Error(
      `YouTube Videos APIエラー: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  if (
    !data.items ||
    data.items
      .length === 0
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

  if (
    details
  ) {
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
      item.snippet
        .title,

    liveBroadcastContent,

    scheduledStartTime:
      details
        ?.scheduledStartTime ||
      '',

    actualStartTime:
      details
        ?.actualStartTime ||
      '',

    actualEndTime:
      details
        ?.actualEndTime ||
      '',

    duration:
      item
        .contentDetails
        ?.duration ||
      'PT0S'
  };
}

function extractYtInitialData(html) {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);

  if (start === -1) {
    return null;
  }

  const slice = html.slice(start + marker.length);
  const end = slice.indexOf(';</script>');

  if (end === -1) {
    return null;
  }

  const jsonText = slice.slice(0, end);

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function parseScheduledDateJST(text) {
  const m = text.trim().match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2}) に公開予定$/
  );

  if (!m) {
    return null;
  }

  const [, y, mo, d, h, mi] = m;

  // JST(UTC+9) -> UTC に変換
  const utcDate = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h) - 9,
      Number(mi)
    )
  );

  return utcDate.toISOString();
}

async function fetchMembersOnlyUpcomingItems(channelId) {
  const url =
    `https://www.youtube.com/channel/${channelId}/streams`;

  let html;

  try {
    const response =
      await fetch(url, {
        headers: {
          'Accept-Language':
            'ja-JP',

          'Cookie':
            'CONSENT=YES+1'
        }
      });

    if (!response.ok) {
      console.error(
        `streamsページ取得に失敗: HTTP ${response.status}`
      );

      return [];
    }

    html =
      await response.text();

  } catch (error) {
    console.error(
      `streamsページ取得中にエラー: ${error.message}`
    );

    return [];
  }

  const data =
    extractYtInitialData(
      html
    );

  if (!data) {
    console.error(
      'ytInitialDataの抽出に失敗しました。'
    );

    return [];
  }

  let items = [];

  try {
    const tabs =
      data.contents
        ?.twoColumnBrowseResultsRenderer
        ?.tabs || [];

    const streamsTab =
      tabs.find(
        tab =>
          tab.tabRenderer
            ?.title ===
          'ライブ'
      ) ||
      tabs.find(
        tab =>
          tab.tabRenderer
            ?.content
            ?.richGridRenderer
      );

    const richGrid =
      streamsTab
        ?.tabRenderer
        ?.content
        ?.richGridRenderer;

    if (!richGrid) {
      console.error('streamsタブが見つかりませんでした。');
      return [];
    }

    items =
      richGrid.contents ||
      [];

  } catch (error) {
    console.error(
      'tabs解析失敗:',
      error.message
    );

    return [];
  }

  const results = [];

  for (const item of items) {

    const lockup =
      item
        .richItemRenderer
        ?.content
        ?.lockupViewModel;

    if (!lockup) {
      continue;
    }

    const videoId =
      lockup.contentId;

    const title =
      lockup.metadata
        ?.lockupMetadataViewModel
        ?.title
        ?.content;

    const metadataRows =
      lockup.metadata
        ?.lockupMetadataViewModel
        ?.metadata
        ?.contentMetadataViewModel
        ?.metadataRows || [];

    let isMembersOnly =
      false;

    let scheduledText =
      '';

    let metadataText =
      '';

    for (
      const row of
      metadataRows
    ) {

      if (row.badges) {
        for (
          const badge of
          row.badges
        ) {
          if (
            badge
              .badgeViewModel
              ?.badgeStyle ===
            'BADGE_MEMBERS_ONLY'
          ) {
            isMembersOnly =
              true;
          }
        }
      }

      if (
        row.metadataParts
      ) {
        const text =
          row.metadataParts
            .map(
              part =>
                part
                  ?.text
                  ?.content ||
                ''
            )
            .join(' ');

        metadataText +=
          text + ' ';

        if (
          text.includes(
            'に公開予定'
          )
        ) {
          scheduledText =
            text;
        }
      }
    }

    let live =
      'live';

    if (
      metadataText.includes(
        'に公開予定'
      )
    ) {
      live =
        'upcoming';

    } else if (
      metadataText.includes(
        'に配信済み'
      )
    ) {
      live =
        'archive';
    }

    if (
      isMembersOnly &&
      videoId &&
      title
    ) {
      results.push({
        videoId,
        title,

        scheduledStartTime:
          parseScheduledDateJST(
            scheduledText
          ),

        source:
          'membersOnlyStreamsPage',

        live
      });
    }
  }

  return results;
}

function buildNotificationMessage(
  video
) {
  const title =
    `**${video.title}**`;

  const isMembersOnly =
    video.isMembersOnly ===
    true;

  // メンバーシップ限定
  if (
    isMembersOnly
  ) {
    let actionText =
      '';

    if (
      video.live ===
      'upcoming'
    ) {
      actionText =
        'が配信予定ソダ～。';

    } else if (
      video.live ===
      'live'
    ) {
      actionText =
        'が配信開始されたソダ～。';

    } else if (
      video.live ===
      'archive'
    ) {
      actionText =
        'が配信終了したソダ～。';

    } else {
      actionText =
        'が配信予定ソダ～。';
    }

    return `🍛メンバーシップ限定🍛

${title}

${actionText}`;
  }

  // 通常通知
  let time =
    '';

  let actionText =
    '';

  if (
    video.live ===
    'upcoming'
  ) {
    time =
      formatDateForMessage(
        video
          .scheduledStartTime
      );

    actionText =
      'が配信開始予定ソダ～。';

  } else if (
    video.live ===
    'live'
  ) {
    time =
      formatDateForMessage(
        video
          .actualStartTime
      );

    actionText =
      'が配信開始されたソダ～。';

  } else if (
    video.live ===
    'archive'
  ) {
    time =
      formatDateForMessage(
        video.actualEndTime ||
        video.actualStartTime ||
        video.sortTime
      );

    actionText =
      'が配信終了したソダ～。';

  } else {
    time =
      formatDateForMessage(
        video.published ||
        video.updated ||
        video.sortTime
      );

    actionText =
      'が投稿されたソダ～。';
  }

  return `${time}に

${title}

${actionText}`;
}

// サムネイル差し替え通知メッセージ
function buildThumbnailChangeMessage(
  video
) {
  const time =
    formatDateForMessage(
      video.actualEndTime ||
      video.actualStartTime ||
      video.sortTime
    );

  return `${time}に

**${video.title}**

のサムネイルが変更されたソダ～。`;
}

function buildWorkFields(
  workInfo
) {
  if (
    !workInfo ||
    workInfo.id === 'chat' ||
    workInfo.id === 'unidentified'
  ) {
    return undefined;
  }

  const fields = [];

  if (workInfo.name) {
    fields.push({
      name:
        '作品',

      value:
        workInfo.name,

      inline:
        false
    });
  }

  if (workInfo.url) {
    fields.push({
      name:
        '作品ページ',

      value:
        workInfo.url,

      inline:
        false
    });
  }

  return fields.length > 0
    ? fields
    : undefined;
}

function buildEmbed(
  videoUrl,
  thumbnailUrl,
  workInfo
) {
  return {
    author:
      {
        name:
          videoUrl,

        url:
          videoUrl
      },

    url:
      videoUrl,

    image:
      {
        url:
          thumbnailUrl
      },

    fields:
      buildWorkFields(
        workInfo
      ),

    color:
      14037892
  };
}

async function postToDiscord(
  channel,
  video,
  workInfo = null,
  isInitialTest = false
) {
  const webhookUrls =
    getWebhookUrls(
      channel
    );

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

  for (
    const webhookUrl of webhookUrls
  ) {
    const body = {
      username:
        channel.channelName,

      avatar_url:
        channel.channelIconUrl ||
        undefined,

      tts:
        false,

      content,

      flags:
        4096,

      allowed_mentions:
        {
          parse:
            []
        },

      embeds: [
        buildEmbed(
          videoUrl,
          thumbnailUrl,
          workInfo
        )
      ]
    };

    const response =
      await fetch(
        webhookUrl,
        {
          method:
            'POST',

          headers:
            {
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
        retryAfter *
          1000
      );

      continue;
    }

    if (
      !response.ok
    ) {
      const text =
        await response.text();

      throw new Error(
        `Discord投稿失敗: HTTP ${response.status} ${text}`
      );
    }

    await sleep(
      DISCORD_MIN_INTERVAL_MS
    );
  }

  return true;
}

// サムネイル差し替え通知送信
async function postThumbnailChangeToDiscord(
  channel,
  video,
  workInfo = null
) {
  const webhookUrls =
    getWebhookUrls(
      channel
    );

  const videoUrl =
    getYouTubeVideoUrl(
      video.videoId
    );

  const thumbnailUrl =
    getYouTubeThumbnailUrl(
      video.videoId
    );

  const message =
    buildThumbnailChangeMessage(
      video
    );

  for (
    const webhookUrl of webhookUrls
  ) {
    const body = {
      username:
        channel.channelName,

      avatar_url:
        channel.channelIconUrl ||
        undefined,

      tts:
        false,

      content:
        message,

      flags:
        4096,

      allowed_mentions:
        {
          parse:
            []
        },

      embeds: [
        buildEmbed(
          videoUrl,
          thumbnailUrl,
          workInfo
        )
      ]
    };

    const response =
      await fetch(
        webhookUrl,
        {
          method:
            'POST',

          headers:
            {
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
        retryAfter *
          1000
      );

      continue;
    }

    if (
      !response.ok
    ) {
      const text =
        await response.text();

      throw new Error(
        `Discord投稿失敗: HTTP ${response.status} ${text}`
      );
    }

    await sleep(
      DISCORD_MIN_INTERVAL_MS
    );
  }

  return true;
}

function classifyVideo(
  video,
  worksMaster
) {
  if (
    !worksMaster ||
    !video?.title
  ) {
    return null;
  }

  const works =
    worksMaster.works || [];

  const caseSensitive =
    worksMaster
      .defaultMatch
      ?.caseSensitive ??
    false;

  const searchTitle =
    caseSensitive
      ? video.title
      : video.title.toLowerCase();

  for (
    const work of works
  ) {
    if (
      !work.patterns ||
      work.patterns
        .length === 0
    ) {
      continue;
    }

    for (
      const pattern of
      work.patterns
    ) {
      const searchPattern =
        caseSensitive
          ? pattern
          : pattern.toLowerCase();

      if (
        searchTitle.includes(
          searchPattern
        )
      ) {
        return work;
      }
    }
  }

  // fallback
  return (
    works.find(
      w =>
        w.id === 'unidentified'
    ) || null
  );
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

    isMembersOnly:
      item.source ===
      'membersOnlyStreamsPage',

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

    firstSeenAt:
      new Date()
        .toISOString(),

    lastSeenAt:
      new Date()
        .toISOString(),

    thumbnailHash:
      null,

    thumbnailHashUpdatedAt:
      null,

    thumbnailNotified:
      false,

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

  let worksMaster = null;

  try {
    const wmResponse =
      await fetch(
        WORKS_MASTER_URL
      );

    if (wmResponse.ok) {
      worksMaster =
        await wmResponse.json();

      // キャッシュ保存
      await writeJson(
        WORKS_MASTER_CACHE_PATH,
        worksMaster
      );

      console.log(
        `worksMaster fetch成功: ${WORKS_MASTER_URL}`
      );

    } else {
      console.warn(
        `worksMaster fetch失敗: HTTP ${wmResponse.status}` +
        `、キャッシュにフォールバックします。`
      );

      worksMaster =
        await readJson(
          WORKS_MASTER_CACHE_PATH,
          null
        );
    }

  } catch (error) {
    console.warn(
      `worksMaster fetchエラー: ${error.message}` +
      `、キャッシュにフォールバックします。`
    );

    worksMaster =
      await readJson(
        WORKS_MASTER_CACHE_PATH,
        null
      );
  }
  
  let initialTestPosted =
    false;

  for (
    const channel of channels
  ) {

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

    // ==================================
    // メンバーシップ限定配信取得
    // ==================================

    const membersOnlyItems =
      await fetchMembersOnlyUpcomingItems(
        channel.channelId
      );

    const trackedMembersOnlyItems =
      membersOnlyItems.filter(
        item => {

          const existing =
            findExisting(
              videoData,
              item.videoId
            );

          // 新規
          if (!existing) {

            if (
              item.live ===
              'upcoming'
            ) {
              return true;
            }

            if (
              item.live ===
              'live'
            ) {

              console.warn(
                `メン限upcoming取り逃し救済: ` +
                `${item.videoId}`
              );

              return true;
            }

            return false;
          }

          // ★変更
          // メン限→通常
          // 通常→メン限
          // の切り替えを追跡するため
          return (
            !existing
              .notifiedArchive
          );
        }
      );

    console.log(
      `メン限処理対象: ${trackedMembersOnlyItems.length} 件`
    );

    // ★追加
    const membersOnlyVideoIds =
      new Set(
        membersOnlyItems.map(
          item => item.videoId
        )
      );

    latestItems = [
      ...latestItems,
      ...trackedMembersOnlyItems
    ];
    
    for (
      const item of latestItems
    ) {

      let info;

      // ==========================
      // メン限（streams HTML）
      // ==========================
      if (
        item.source ===
        'membersOnlyStreamsPage'
      ) {

        info = {
          title:
            item.title,

          liveBroadcastContent:
            item.live,

          scheduledStartTime:
            item
              .scheduledStartTime ||
            '',

          actualStartTime:
            '',

          actualEndTime:
            '',

          duration:
            'PT0S'
        };

      } else {

        // ==========================
        // 通常動画（YouTube API）
        // ==========================
        info =
          await fetchVideoInfo(
            item.videoId
          );
      }

      let existing =
        findExisting(
          videoData,
          item.videoId
        );

      if (!existing) {

        if (
          info.liveBroadcastContent ===
          'archive'
        ) {

          console.warn(
            `過去アーカイブ検知のため無視: ${item.videoId}`
          );

          continue;
        }

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

      // ★追加
      // 現在のメン限状態を毎回同期
      const currentMembersOnly =
        membersOnlyVideoIds.has(
          item.videoId
        );

      existing.isMembersOnly =
        currentMembersOnly;

      // 作品分類
      const workInfo =
        classifyVideo(
          existing,
          worksMaster
        );

      // ==================================
      // 保険ログ
      // ==================================

      // LIVE遷移失敗warn
      // （予定時刻超過なのにupcoming）
      if (
        existing
          .isMembersOnly ===
          true &&
        existing.live ===
          'upcoming' &&
        info
          .liveBroadcastContent ===
          'upcoming' &&
        existing
          .scheduledStartTime &&
        new Date(
          existing
            .scheduledStartTime
        ) < new Date()
      ) {

        console.warn(
          `メン限LIVE遷移未確認: ` +
          `${existing.videoId}` +
          ` (予定時刻: ` +
          `${existing.scheduledStartTime})`
        );
      }

      // ARCHIVE遷移失敗warn
      // （12時間以上live固定）
      if (
        existing
          .isMembersOnly ===
          true &&
        existing.live ===
          'live' &&
        info
          .liveBroadcastContent ===
          'live' &&
        existing
          .liveDetectedAt
      ) {

        const detectedAt =
          new Date(
            existing
              .liveDetectedAt
          );

        const now =
          new Date();

        const hoursElapsed =
          (
            now -
            detectedAt
          ) /
          (
            1000 *
            60 *
            60
          );

        if (
          hoursElapsed >=
          12
        ) {

          console.warn(
            `メン限ARCHIVE遷移未確認: ` +
            `${existing.videoId}` +
            ` (LIVE検知時刻: ` +
            `${existing.liveDetectedAt})`
          );
        }
      }

      // ==================================
      // 状態更新
      // ==================================

      if (
        !shouldProcessItem(
          existing,
          info.liveBroadcastContent
        )
      ) {

        console.warn(
          `不正遷移を無視: ` +
          `${existing.videoId} ` +
          `${existing.live} -> ` +
          `${info.liveBroadcastContent}`
        );

        continue;
      }

      existing.live =
        info.liveBroadcastContent;

      existing.lastSeenAt =
        new Date()
          .toISOString();

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

      // ==================================
      // サムネイルハッシュ検知
      // ==================================

      const newThumbnailHash =
        await downloadAndHashThumbnail(
          item.videoId
        );

      if (newThumbnailHash) {

        // 初回チェック時にハッシュ保存
        if (
          !existing.thumbnailHash
        ) {
          existing.thumbnailHash =
            newThumbnailHash;

          existing
            .thumbnailHashUpdatedAt =
            new Date()
              .toISOString();
        } else if (
          shouldNotifyThumbnailChange(
            existing,
            newThumbnailHash
          )
        ) {

          // archive または video で
          // ハッシュが変わった場合のみ通知

          await postThumbnailChangeToDiscord(
            channel,
            existing,
            workInfo
          );

          existing
            .thumbnailNotified =
            true;

          existing.thumbnailHash =
            newThumbnailHash;

          existing
            .thumbnailHashUpdatedAt =
            new Date()
              .toISOString();
        } else {

          // ハッシュが変わったが通知対象外
          // （upcoming・live での変更）
          // ハッシュだけ更新

          existing.thumbnailHash =
            newThumbnailHash;

          existing
            .thumbnailHashUpdatedAt =
            new Date()
              .toISOString();
        }
      }

      // ==================================
      // 初回テスト通知
      // ==================================

      if (
        isInitialRun &&
        !initialTestPosted
      ) {

        await postToDiscord(
          channel,
          existing,
          workInfo,
          true
        );

        initialTestPosted =
          true;

        switch (
          existing.live
        ) {

          case 'upcoming':
            existing
              .notifiedUpcoming =
              true;
            break;

          case 'live':
            existing
              .notifiedLive =
              true;
            break;

          case 'archive':
            existing
              .notifiedArchive =
              true;
            break;

          default:
            existing
              .notifiedVideo =
              true;
        }

        continue;
      }

      // ==================================
      // 通常通知
      // ==================================

      // 動画投稿
      if (
        existing.live ===
          'video' &&
        !existing
          .notifiedVideo
      ) {

        await postToDiscord(
          channel,
          existing,
          workInfo
        );

        existing
          .notifiedVideo =
          true;
      }

      // 配信予定
      if (
        existing.live ===
          'upcoming' &&
        !existing
          .notifiedUpcoming
      ) {

        await postToDiscord(
          channel,
          existing,
          workInfo          
        );

        existing
          .notifiedUpcoming =
          true;
      }

      // 配信開始
      if (
        existing.live ===
          'live' &&
        !existing
          .notifiedLive
      ) {

        await postToDiscord(
          channel,
          existing,
          workInfo
        );

        existing
          .notifiedLive =
          true;

        // メン限のみ
        // live検知時刻保存
        if (
          existing
            .isMembersOnly ===
          true
        ) {

          existing
            .liveDetectedAt =
            new Date()
              .toISOString();
        }
      }

      // 配信終了
      if (
        existing.live ===
          'archive' &&
        !existing
          .notifiedArchive
      ) {

        await postToDiscord(
          channel,
          existing,
          workInfo
        );

        existing
          .notifiedArchive =
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

  if (
    isInitialRun
  ) {

    console.log(
      `初回実行: テスト通知 ${
        initialTestPosted
          ? '成功'
          : '未送信'
      }`
    );
  }
}

main().catch(
  error => {

    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
