import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { MINIO_CONNECTION } from "./minio.constants";

export const MinioProvider: Provider = {
  provide: MINIO_CONNECTION,
  useFactory: async (configService: ConfigService): Promise<Minio.Client> => {
    const options: Minio.ClientOptions = {
      endPoint: configService.get<string>("MINIO_ENDPOINT"),
      port: configService.get<number>("MINIO_PORT"),
      // useSSL: Boolean(configService.get<boolean>("MINIO_USE_SSL")),
      useSSL: false,
      accessKey: configService.get<string>("MINIO_ACCESS_KEY"),
      secretKey: configService.get<string>("MINIO_SECRET_KEY"),
      //   region: configService.get<string>("MINIO_REGION"),
    };

    const minioClient = new Minio.Client(options);
    await minioClient.listBuckets();

    return minioClient;
  },
  inject: [ConfigService],
};
