import fs from 'node:fs/promises';

const CHANNELS_PATH =
  'data/channels.json';

const VIDEO_DATA_PATH =
  'data/videoData.json';

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

function getYouTubeChannelUrl(
  channelId
) {
  return (
    'https://www.youtube.com/channel/' +
    channelId
  );
}

async function fetchLatestItems(
  channelId
) {
  const rssUrl =
    YOUTUBE_RSS_PREFIX +
    channelId;

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

    console.error(
      `RSS取得に失敗しました。channelId=${channelId}, HTTP ${response.status}`
    );
  } catch (
    error
  ) {
    console.error(
      `RSS取得中にエラー: ${error.message}`
    );
  }

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
  const m = text.match(
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

async function postToDiscord(
  channel,
  video,
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
        {
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

          color:
            14037892
        }
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
    videoData.length ===
    0;

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
      latestItems.length >
        0
    ) {
      latestItems = [
        latestItems[0]
      ];
    }

    // メンバーシップ限定配信の取得
    const membersOnlyItems =
      await fetchMembersOnlyUpcomingItems(
        channel.channelId
      );

    // 新規枠 + トラッキング中を再監視
    const trackedMembersOnlyItems =
      membersOnlyItems.filter(
        item => {
          const existing =
            videoData.find(
              row =>
                row.videoId ===
                item.videoId
            );

          // 完全新規
          if (
            !existing
          ) {
            // upcoming のみ採用
            // （古いarchive誤通知防止）
            return (
              item.live ===
              'upcoming'
            );
          }

          // 既存トラッキング中
          return (
            existing.isMembersOnly ===
              true &&
            !existing.notifiedArchive
          );
        }
      );

    console.log(
      `メン限処理対象: ${trackedMembersOnlyItems.length} 件`
    );

    latestItems = [
      ...latestItems,
      ...trackedMembersOnlyItems
    ];

    for (
      const item of latestItems
    ) {
      let info;

      // メン限は
      // /streams情報を採用
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
            item.scheduledStartTime ||
            '',

          actualStartTime:
            '',

          actualEndTime:
            '',

          duration:
            'PT0S'
        };

      } else {
        // 通常動画・通常配信
        info =
          await fetchVideoInfo(
            item.videoId
          );
      }

      let existing =
        videoData.find(
          row =>
            row.videoId ===
            item.videoId
        );

      // 新規登録
      if (
        !existing
      ) {
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

      // 状態更新
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

      // 初回実行時
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

      // 通常動画
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

      // 配信予定
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

      // 配信開始
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

      // 配信終了
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
