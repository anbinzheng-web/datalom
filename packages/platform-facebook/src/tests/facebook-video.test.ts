import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildFacebookVideoSearch,
  facebookVideoSearchTemplate,
  parseFacebookVideoSearch,
} from '../api/facebook-video.ts';

test('Facebook video search uses the observed VIDEOS_TAB template', () => {
  const html =
    '"queryID":"27703307686009464","variables":{"count":5,"args":{"experience":{"type":"VIDEOS_TAB"},"text":"seed"},"cursor":null},"queryName":"SearchCometResultsInitialResultsQuery"';
  const template = facebookVideoSearchTemplate(html);
  assert.equal(template.docId, '27703307686009464');
  const request = buildFacebookVideoSearch(
    {
      url: 'https://www.facebook.com/api/graphql/',
      name: 'SearchCometResultsInitialResultsQuery',
      docId: template.docId,
      requestBody: new URLSearchParams({
        fb_api_req_friendly_name: 'SearchCometResultsInitialResultsQuery',
        doc_id: template.docId,
        fb_dtsg: 'd',
        lsd: 'l',
        __req: 'a',
        variables: JSON.stringify(template.variables),
      }).toString(),
      requestHeaders: {},
    },
    'seed',
    null,
    1,
  );
  assert.equal(
    JSON.parse(new URLSearchParams(request.body).get('variables')!).args.experience.type,
    'VIDEOS_TAB',
  );
});

test('Facebook video parser extracts Reel identity and engagement fields', () => {
  const story = {
    post_id: 'post-1',
    creation_time: 1700000000,
    actors: [{ id: 'author-1', name: 'Creator' }],
    attachments: [
      {
        media: { __typename: 'Video', id: '123' },
        styles: { attachment: { media: { length_in_second: 12 } } },
      },
    ],
    comet_sections: {
      content: {
        story: {
          comet_sections: { message: { story: { message: { text: 'jeans #style', ranges: [] } } } },
        },
      },
      feedback: {
        story: {
          story_ufi_container: {
            story: {
              feedback_context: {
                feedback_target_with_context: {
                  comment_rendering_instance: { comments: { total_count: 7 } },
                  comet_ufi_summary_and_actions_renderer: {
                    feedback: {
                      adaptive_ufi_action_renderers: [
                        { feedback: { reaction_count: { count: 11 } } },
                        { feedback: { share_count: { count: 2 } } },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const body = {
    data: {
      serpResponse: {
        results: {
          edges: [
            {
              rendering_strategy: {
                __typename: 'SearchVideoPostRenderingStrategy',
                view_model: { story },
              },
            },
          ],
          page_info: { end_cursor: null, has_next_page: false },
        },
      },
    },
  };
  const result = parseFacebookVideoSearch(200, JSON.stringify(body));
  assert.equal(result.items[0].videoId, '123');
  assert.equal(result.items[0].likes, 11);
  assert.equal(result.items[0].commentsCount, 7);
  assert.equal(result.items[0].shares, 2);
  assert.equal(result.items[0].durationSeconds, 12);
});

import {
  facebookCommentRequest,
  parseFacebookComments,
} from '../api/facebook-comments.ts';

test('Facebook comments preserve comment IDs, users and immediate reply parents', () => {
  const parentFeedback = Buffer.from('feedback:1_2').toString('base64');
  const target = {
    videoId: '123',
    feedbackId: parentFeedback,
    parentCommentId: 'Y29tbWVudDoxXzI=',
  };
  const capture = {
    url: 'https://www.facebook.com/api/graphql/',
    name: 'SearchCometResultsInitialResultsQuery',
    docId: '111',
    requestBody: new URLSearchParams({
      fb_api_req_friendly_name: 'SearchCometResultsInitialResultsQuery',
      doc_id: '111',
      fb_dtsg: 'd',
      lsd: 'l',
      __req: 'a',
      variables: '{}',
    }).toString(),
    requestHeaders: {},
  } as any;
  const request = facebookCommentRequest(capture, { ...target, expansionToken: 'token' }, null, 1);
  assert.equal(request.operation, 'comment.replies');
  const body = {
    data: {
      node: {
        id: target.feedbackId,
        replies_connection: {
          edges: [
            {
              node: {
                id: 'reply-1',
                depth: 2,
                comment_direct_parent: { id: target.parentCommentId },
                author: { id: 'user-1', name: 'User', url: 'https://www.facebook.com/user' },
                body: { text: 'hello' },
                created_time: 1700000000,
                feedback: {
                  id: 'reply-feedback',
                  url: 'https://www.facebook.com/reel/123/?comment_id=1',
                  replies_fields: { total_count: 0 },
                },
                comment_action_links: [
                  { comment: { feedback: { unified_reactors: { count: 2 } } } },
                ],
                attachments: [],
                translatability_for_viewer: { source_dialect: 'en_US' },
              },
            },
          ],
          page_info: { end_cursor: null, has_next_page: false, has_previous_page: false },
        },
      },
    },
  };
  const result = parseFacebookComments(
    'comment.replies',
    request.variables,
    200,
    JSON.stringify(body),
    target,
  );
  assert.equal(result.rows[0]?.commentId, 'reply-1');
  assert.equal(result.rows[0]?.parentCommentId, target.parentCommentId);
  assert.equal(result.rows[0]?.userKey, 'user-1');
  assert.equal(result.rows[0]?.likes, 2);
});
