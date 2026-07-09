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

const ANNIVERSARY_DATA_PATH =
  'data/anniversaryData.json';

const CHANNEL_ANNIVERSARY_MONTH =
  7;

const CHANNEL_ANNIVERSARY_DAY =
  3;

const CHANNEL_OPEN_YEAR =
  2020;

const CHANNEL_ANNIVERSARY_URL =
  'https://www.youtube.com/@BabiSodaSky';

const STREAM_ANNIVERSARY_MONTH =
  7;

const STREAM_ANNIVERSARY_DAY =
  11;

const STREAM_OPEN_YEAR =
  2020;

const SUBSCRIBER_1000_MONTH =
  9;

const SUBSCRIBER_1000_DAY =
  30;

const SUBSCRIBER_1000_YEAR =
  2023;

const WASHISODA_BIRTHDAY_MONTH =
  10;

const WASHISODA_BIRTHDAY_DAY =
  20;

const BABISODA_BIRTHDAY_MONTH =
  1;

const BABISODA_BIRTHDAY_DAY =
  14;

const BABISODA_BIRTH_YEAR =
  2021;

const COUNTDOWN_DATES = [
  // CH創設記念日 (7/3)
  { id: 'ch_3mo', month: 4, day: 3, label: '3ヶ月', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_2mo', month: 5, day: 3, label: '2ヶ月', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_1mo', month: 6, day: 3, label: '1ヶ月', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_2w', month: 6, day: 18, label: '半月', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_3d', month: 6, day: 30, label: '3日', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_2d', month: 7, day: 1, label: '2日', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },
  { id: 'ch_1d', month: 7, day: 2, label: '1日', kind: 'anniversary', target: '7/3（CH創設記念日）', anniversaryBaseYear: CHANNEL_OPEN_YEAR },

  // 配信開始記念日 (7/11)
  { id: 'str_3mo', month: 4, day: 11, label: '3ヶ月', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_2mo', month: 5, day: 11, label: '2ヶ月', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_1mo', month: 6, day: 11, label: '1ヶ月', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_2w', month: 6, day: 26, label: '半月', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_3d', month: 7, day: 8, label: '3日', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_2d', month: 7, day: 9, label: '2日', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },
  { id: 'str_1d', month: 7, day: 10, label: '1日', kind: 'anniversary', target: '7/11（配信開始記念日）', anniversaryBaseYear: STREAM_OPEN_YEAR },

  // CH登録者数1,000人突破記念日 (9/30)
  { id: 'sub_3mo', month: 6, day: 30, label: '3ヶ月', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_2mo', month: 7, day: 30, label: '2ヶ月', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_1mo', month: 8, day: 30, label: '1ヶ月', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_2w', month: 9, day: 15, label: '半月', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_3d', month: 9, day: 27, label: '3日', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_2d', month: 9, day: 28, label: '2日', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },
  { id: 'sub_1d', month: 9, day: 29, label: '1日', kind: 'anniversary', target: 'CH登録者数1,000人突破記念日', anniversaryBaseYear: SUBSCRIBER_1000_YEAR },

  // 曽田すかいのお誕生日 (10/20)
  { id: 'ws_3mo', month: 7, day: 20, label: '3ヶ月', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_2mo', month: 8, day: 20, label: '2ヶ月', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_1mo', month: 9, day: 20, label: '1ヶ月', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_2w', month: 10, day: 5, label: '半月', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_3d', month: 10, day: 17, label: '3日', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_2d', month: 10, day: 18, label: '2日', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },
  { id: 'ws_1d', month: 10, day: 19, label: '1日', kind: 'birthday_washisoda', target: '曽田すかいのお誕生日', anniversaryBaseYear: null },

  // バ美ソダちゃんのお誕生日 (1/14)
  { id: 'bs_3mo', month: 10, day: 14, label: '3ヶ月', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_2mo', month: 11, day: 14, label: '2ヶ月', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_1mo', month: 12, day: 14, label: '1ヶ月', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_2w', month: 12, day: 30, label: '半月', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_3d', month: 1, day: 11, label: '3日', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_2d', month: 1, day: 12, label: '2日', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
  { id: 'bs_1d', month: 1, day: 13, label: '1日', kind: 'birthday_babisoda', target: 'バ美ソダちゃんのお誕生日', anniversaryBaseYear: BABISODA_BIRTH_YEAR },
];

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
      console.error(
        'streamsタブが見つかりませんでした。'
      );

      console.debug(
        'tabs構造:',
        JSON.stringify(
          tabs.map(
            tab =>
              tab.tabRenderer?.title
          ),
          null,
          2
        )
      );

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

function buildWorkDescription(
  workInfo
) {
  if (
    !workInfo ||
    workInfo.id === 'unidentified'
  ) {
    return undefined;
  }

  const lines = [
    '✌️Today\'s Menuソダ～✌️'
  ];

  if (
    workInfo.id === 'chat'
  ) {
    lines.push('雑談');

  } else {

    if (workInfo.name) {
      lines.push(workInfo.name);
    }

    if (workInfo.url) {
      lines.push(workInfo.url);
    }
  }

  return lines.join('\n');
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

    description:
      buildWorkDescription(
        workInfo
      ),

    image:
      {
        url:
          thumbnailUrl
      },

    color:
      14037892
  };
}

async function sendToWebhooks(
  webhookUrls,
  body
) {
  for (
    const webhookUrl of webhookUrls
  ) {
    const maxRetries =
      3;

    let attempt =
      0;

    while (
      attempt < maxRetries
    ) {
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
        attempt++;

        const retryAfter =
          Number(
            response.headers.get(
              'retry-after'
            ) || 10
          );

        console.error(
          `Discord rate limit。${retryAfter}秒待機します。` +
          `(試行 ${attempt}/${maxRetries})`
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

      break;
    }

    if (
      attempt >=
      maxRetries
    ) {
      console.error(
        `Discord rate limit超過。` +
        `${webhookUrl} への投稿を断念しました。`
      );
    }
  }
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
      ? `【初回テスト通知】\n${message}`
      : message;

  await sendToWebhooks(
    webhookUrls,
    {
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
    }
  );

  return true;
}

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

  await sendToWebhooks(
    webhookUrls,
    {
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
    }
  );

  return true;
}

// JST基準の今日の年月日を取得する共通ヘルパー
function getTodayJST() {
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
          '2-digit'
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const get =
    type =>
      Number(
        parts
          .find(p => p.type === type)
          ?.value
      );

  return {
    year:  get('year'),
    month: get('month'),
    day:   get('day')
  };
}

function buildChannelAnniversaryMessage(
  anniversary
) {
  return (
    `🎊**${anniversary}周年（CH創設記念日）**🎊

ワシソダCHの創設、**${anniversary}周年**おめでとうソダ～！🥳

🎉曽田すかい＠ワシソダch🎉
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function postAnniversaryToDiscord(
  channels,
  message
) {
  for (
    const channel of channels
  ) {
    const webhookUrls =
      getWebhookUrls(
        channel
      );

    await sendToWebhooks(
      webhookUrls,
      {
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
          }
      }
    );
  }

  return true;
}

async function checkChannelAnniversary(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  if (
    month !==
      CHANNEL_ANNIVERSARY_MONTH ||
    day !==
      CHANNEL_ANNIVERSARY_DAY
  ) {
    return false;
  }

  const lastSentYear =
    anniversaryData
      ?.channelAnniversary
      ?.lastSentYear ??
    0;

  if (
    lastSentYear ===
    year
  ) {
    console.log(
      '今年のchannelAnniversary通知は送信済みです。'
    );

    return false;
  }

  const anniversary =
    year -
    CHANNEL_OPEN_YEAR;

  await postAnniversaryToDiscord(
    channels,
    buildChannelAnniversaryMessage(
      anniversary
    )
  );

  anniversaryData
    .channelAnniversary
    .lastSentYear =
    year;

  console.log(
    `CH創設${anniversary}周年通知を送信しました。`
  );

  return true;
}

function buildStreamAnniversaryMessage(
  anniversary
) {
  return (
    `🎊**${anniversary}周年（配信開始記念日）**🎊

ワシソダCHの配信開始、**${anniversary}周年**おめでとうソダ～！🥳

🎉曽田すかい＠ワシソダch🎉
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function checkStreamAnniversary(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  if (
    month !==
      STREAM_ANNIVERSARY_MONTH ||
    day !==
      STREAM_ANNIVERSARY_DAY
  ) {
    return false;
  }

  const lastSentYear =
    anniversaryData
      ?.streamAnniversary
      ?.lastSentYear ??
    0;

  if (
    lastSentYear ===
    year
  ) {
    console.log(
      '今年のstreamAnniversary通知は送信済みです。'
    );

    return false;
  }

  const anniversary =
    year -
    STREAM_OPEN_YEAR;

  await postAnniversaryToDiscord(
    channels,
    buildStreamAnniversaryMessage(
      anniversary
    )
  );

  anniversaryData
    .streamAnniversary
    .lastSentYear =
    year;

  console.log(
    `配信開始${anniversary}周年通知を送信しました。`
  );

  return true;
}

function buildSubscriber1000Message(
  anniversary
) {
  return (
    `🎊**${anniversary}周年（CH登録者数1,000人突破記念日）**🎊

ワシソダCHのチャンネル登録者数1,000人突破、**${anniversary}周年**おめでとうソダ～！🥳

🎉曽田すかい＠ワシソダch🎉
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function checkSubscriber1000(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  if (
    month !==
      SUBSCRIBER_1000_MONTH ||
    day !==
      SUBSCRIBER_1000_DAY
  ) {
    return false;
  }

  const lastSentYear =
    anniversaryData
      ?.subscriber1000
      ?.lastSentYear ??
    0;

  if (
    lastSentYear ===
    year
  ) {
    console.log(
      '今年のsubscriber1000通知は送信済みです。'
    );

    return false;
  }

  const anniversary =
    year -
    SUBSCRIBER_1000_YEAR;

  await postAnniversaryToDiscord(
    channels,
    buildSubscriber1000Message(
      anniversary
    )
  );

  anniversaryData
    .subscriber1000
    .lastSentYear =
    year;

  console.log(
    `CH登録者数1,000人突破${anniversary}周年通知を送信しました。`
  );

  return true;
}

function buildWashisodaBirthdayMessage() {
  return (
    `🎂**曽田すかいのお誕生日**🎂

ソダさん、今年も、お誕生日おめでとうソダ～！🥳

🎉曽田すかい＠ワシソダch🎉
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function checkWashisodaBirthday(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  if (
    month !==
      WASHISODA_BIRTHDAY_MONTH ||
    day !==
      WASHISODA_BIRTHDAY_DAY
  ) {
    return false;
  }

  const lastSentYear =
    anniversaryData
      ?.washisodaBirthday
      ?.lastSentYear ??
    0;

  if (
    lastSentYear ===
    year
  ) {
    console.log(
      '今年のwashisodaBirthday通知は送信済みです。'
    );

    return false;
  }

  await postAnniversaryToDiscord(
    channels,
    buildWashisodaBirthdayMessage()
  );

  anniversaryData
    .washisodaBirthday
    .lastSentYear =
    year;

  console.log(
    '曽田すかい誕生日通知を送信しました。'
  );

  return true;
}

function buildBabisodaBirthdayMessage(
  anniversary
) {
  return (
    `🎂**バ美ソダちゃんのお誕生日**🎂

バ美ソダちゃん、お誕生日（${anniversary}歳）おめでとうソダ～！🥳

🎉曽田すかい＠ワシソダch🎉
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function checkBabisodaBirthday(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  if (
    month !==
      BABISODA_BIRTHDAY_MONTH ||
    day !==
      BABISODA_BIRTHDAY_DAY
  ) {
    return false;
  }

  const lastSentYear =
    anniversaryData
      ?.babisodaBirthday
      ?.lastSentYear ??
    0;

  if (
    lastSentYear ===
    year
  ) {
    console.log(
      '今年のbabisodaBirthday通知は送信済みです。'
    );

    return false;
  }

  const anniversary =
    year -
    BABISODA_BIRTH_YEAR;

  await postAnniversaryToDiscord(
    channels,
    buildBabisodaBirthdayMessage(
      anniversary
    )
  );

  anniversaryData
    .babisodaBirthday
    .lastSentYear =
    year;

  console.log(
    `バ美ソダちゃん誕生日（${anniversary}歳）通知を送信しました。`
  );

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

function buildCountdownMessage(
  anniversary,
  label,
  target
) {
  return (
    `⏳**${anniversary}周年カウントダウン**⏳

ワシソダCHの${target}、${label}前ソダ～✨

👉曽田すかい＠ワシソダch👈
${CHANNEL_ANNIVERSARY_URL}`
  );
}

function buildWashisodaCountdownMessage(
  label
) {
  return (
    `⏳**お誕生日カウントダウン**⏳

ソダさんのお誕生日、${label}前ソダ～✨

👉曽田すかい＠ワシソダch👈
${CHANNEL_ANNIVERSARY_URL}`
  );
}

function buildBabisodaCountdownMessage(
  anniversary,
  label
) {
  return (
    `⏳**お誕生日カウントダウン**⏳

バ美ソダちゃんのお誕生日（${anniversary}歳）、${label}前ソダ～✨

👉曽田すかい＠ワシソダch👈
${CHANNEL_ANNIVERSARY_URL}`
  );
}

async function checkCountdown(
  channels,
  anniversaryData
) {
  const {
    year,
    month,
    day
  } = getTodayJST();

  const todayEntries =
    COUNTDOWN_DATES.filter(
      d =>
        d.month === month &&
        d.day === day
    );

  if (
    todayEntries.length === 0
  ) {
    return false;
  }

  if (
    !anniversaryData.countdown
  ) {
    anniversaryData.countdown = {
      sentKeys: []
    };
  }

  if (
    !Array.isArray(
      anniversaryData
        .countdown
        .sentKeys
    )
  ) {
    anniversaryData
      .countdown
      .sentKeys = [];
  }

  let anyUpdated =
    false;

  for (
    const entry of todayEntries
  ) {
    const key =
      `${year}_${entry.id}`;

    if (
      anniversaryData
        .countdown
        .sentKeys
        .includes(key)
    ) {
      console.log(
        `カウントダウン通知は送信済みです。(${key})`
      );

      continue;
    }

    let message;

    if (
      entry.kind ===
      'anniversary'
    ) {
      const anniversary =
        year -
        entry.anniversaryBaseYear;

      message =
        buildCountdownMessage(
          anniversary,
          entry.label,
          entry.target
        );

    } else if (
      entry.kind ===
      'birthday_washisoda'
    ) {
      message =
        buildWashisodaCountdownMessage(
          entry.label
        );

    } else if (
      entry.kind ===
      'birthday_babisoda'
    ) {
      // 誕生日(1/14)より前の月なら今年+1歳、
      // 誕生日直前(1月)なら今年の歳
      const upcomingAge =
        month >
        BABISODA_BIRTHDAY_MONTH
          ? (year + 1) -
            BABISODA_BIRTH_YEAR
          : year -
            BABISODA_BIRTH_YEAR;

      message =
        buildBabisodaCountdownMessage(
          upcomingAge,
          entry.label
        );

    } else {
      console.warn(
        `不明なkind: ${entry.kind} (${key})`
      );

      continue;
    }

    await postAnniversaryToDiscord(
      channels,
      message
    );

    anniversaryData
      .countdown
      .sentKeys
      .push(key);

    console.log(
      `${entry.label}前カウントダウン通知を送信しました。(${key})`
    );

    anyUpdated =
      true;
  }

  // 前年以前の古いキーを削除
  anniversaryData
    .countdown
    .sentKeys =
    anniversaryData
      .countdown
      .sentKeys
      .filter(
        k =>
          k.startsWith(
            String(year) + '_'
          )
      );

  return anyUpdated;
}

function createVideoState(
  channel,
  item,
  info
) {
  const now =
    new Date()
      .toISOString();

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
      now,

    lastSeenAt:
      now,

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

  const anniversaryData =
    await readJson(
      ANNIVERSARY_DATA_PATH,
      {
        channelAnniversary: {
          lastSentYear: 0
        },
        streamAnniversary: {
          lastSentYear: 0
        },
        subscriber1000: {
          lastSentYear: 0
        },
        washisodaBirthday: {
          lastSentYear: 0
        },
        babisodaBirthday: {
          lastSentYear: 0
        },
        countdown: {
          sentKeys: []
        }
      }
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

  const channelAnniversaryUpdated =
    await checkChannelAnniversary(
      channels,
      anniversaryData
    );

  const streamAnniversaryUpdated =
    await checkStreamAnniversary(
      channels,
      anniversaryData
    );

  const subscriber1000Updated =
    await checkSubscriber1000(
      channels,
      anniversaryData
    );

  const washisodaBirthdayUpdated =
    await checkWashisodaBirthday(
      channels,
      anniversaryData
    );

  const babisodaBirthdayUpdated =
    await checkBabisodaBirthday(
      channels,
      anniversaryData
    );

  const countdownUpdated =
    await checkCountdown(
      channels,
      anniversaryData
    );

  const anniversaryUpdated =
    channelAnniversaryUpdated ||
    streamAnniversaryUpdated ||
    subscriber1000Updated ||
    washisodaBirthdayUpdated ||
    babisodaBirthdayUpdated ||
    countdownUpdated;

  await writeJson(
    VIDEO_DATA_PATH,
    videoData
  );

  console.log(
    'videoData.json を更新しました。'
  );

  if (
    anniversaryUpdated
  ) {

    await writeJson(
      ANNIVERSARY_DATA_PATH,
      anniversaryData
    );

    console.log(
      'anniversaryData.json を更新しました。'
    );
  }

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
