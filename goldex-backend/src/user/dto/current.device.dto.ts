export class CurrentDeviceDto {
  id: string;
  deviceId: string;
  ipAddress: string;
  deviceType: string;
  userAgent: string;
  lastLogin: Date;
  createdAt: Date;
  isConnected?: boolean;
}
