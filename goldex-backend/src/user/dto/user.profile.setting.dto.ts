export class UserProfileSettingDto {
  defaultLanguage: languageDTO;
  isEmailNotificationEnabled: boolean;
}

class languageDTO {
  id: number;
  locale: string;
  name: string;
  nativeName: string;
}
