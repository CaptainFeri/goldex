export interface MailService {
  sendMail(to: string, subject: string, body: string): Promise<void>;
}
