export interface ChannelTarget {
  id?: string;
  username?: string;
}

export interface TelegramOptions {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  password?: string;
  sessionString?: string;
  sessionFolder?: string;
  monitoredChannels?: ChannelTarget[];
  targetChannel?: string;
  walletReportChannel?: string;
}
