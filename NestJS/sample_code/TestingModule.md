# E2Eテスト用 Utilityクラス

E2Eのテストで利用するUtilityクラス。

テスト向けのセットアップなどを担う。


```typescript
import {
  ClassProvider,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { TestingModule as NestTestingModule, Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';

import { PrismaService } from 'src/infra/service';
import { AppModule } from 'src/module/app.module';

export class TestingModule {
  static async create(override: ClassProvider[] = []): Promise<TestingModule> {
    const { app, prisma } = await TestingModule.setup(override);
    return new TestingModule(app, prisma);
  }

  private constructor(
    readonly nestApp: INestApplication,
    readonly prismaClient: PrismaService,
  ) {}

  private static async setup(override: ClassProvider[] = []): Promise<{
    app: INestApplication;
    prisma: PrismaService;
  }> {
    vi.stubEnv('DATABASE_URL', process.env.DATABASE_URL_TEST ?? '');

    let builder = Test.createTestingModule({
      imports: [AppModule],
    });

    override.forEach((provider) => {
      builder = builder
        .overrideProvider(provider.provide)
        .useClass(provider.useClass);
    });

    const moduleFixture: NestTestingModule = await builder.compile();

    const app: INestApplication = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
      }),
    );

    await app.init();

    moduleFixture.useLogger(new ConsoleLogger('test', { logLevels: [] }));

    const prisma = await moduleFixture.resolve(PrismaService);

    return { app, prisma };
  }
  async teardown() {
    await this.nestApp.close();
    vi.unstubAllEnvs();
  }

  request() {
    return request(this.nestApp.getHttpServer());
  }
}
```
