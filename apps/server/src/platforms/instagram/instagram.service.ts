import { Inject, Injectable } from '@nestjs/common';
import { Store } from '@datalom/shared/storage/store';
import { InstagramSessions } from '@datalom/platform-instagram/session';
import { InstagramTransport } from '@datalom/platform-instagram/transport';
import { buildRequest, validateResult } from '@datalom/platform-instagram/native';
import type { CapturedPlatform } from '../../public-api/captured-platform.service.js';
@Injectable()
export class InstagramService {
  readonly platform: CapturedPlatform;
  constructor(@Inject(Store) store: Store) {
    this.platform = {
      platform: 'instagram',
      sessions: new InstagramSessions(store),
      build: buildRequest,
      validate: validateResult,
      transport: InstagramTransport,
    };
  }
}
