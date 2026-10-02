import { Inject, Injectable } from '@nestjs/common';
import { Store } from '@datalom/shared/storage/store';
import { XSessions } from '@datalom/platform-x/session';
import { XTransport } from '@datalom/platform-x/transport';
import { buildRequest, validateResult } from '@datalom/platform-x/native';
import type { CapturedPlatform } from '../../public-api/captured-platform.service.js';
@Injectable()
export class XService {
  readonly platform: CapturedPlatform;
  constructor(@Inject(Store) store: Store) {
    this.platform = {
      platform: 'x',
      sessions: new XSessions(store),
      build: buildRequest,
      validate: validateResult,
      transport: XTransport,
    };
  }
}
