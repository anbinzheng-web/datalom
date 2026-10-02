import { Inject, Injectable } from '@nestjs/common';
import { Store } from '@datalom/shared/storage/store';
import { FacebookSessions } from '@datalom/platform-facebook/session';
import { FacebookTransport } from '@datalom/platform-facebook/transport';
import { buildRequest, validateResult } from '@datalom/platform-facebook/native';
import type { CapturedPlatform } from '../../public-api/captured-platform.service.js';
@Injectable()
export class FacebookService {
  readonly platform: CapturedPlatform;
  constructor(@Inject(Store) store: Store) {
    this.platform = {
      platform: 'facebook',
      sessions: new FacebookSessions(store),
      build: buildRequest,
      validate: validateResult,
      transport: FacebookTransport,
    };
  }
}
