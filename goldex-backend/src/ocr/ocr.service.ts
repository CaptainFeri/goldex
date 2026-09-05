import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { catchError } from "rxjs/operators";

interface OcrResult {
  success: boolean;
  texts: string[];
  error?: string;
  processing_time_ms?: number;
  metadata?: Record<string, any>;
}

export interface OcrHealthResponse {
  status: string;
  model_loaded: boolean;
  model_name?: string;
  model_language?: string;
  model_path?: string;
}

export interface OcrTrainStatusResponse {
  state: string;
  started_at?: number;
  last_train_at?: number;
  last_result?: any;
  error?: string;
  sample_count: number;
  available_samples: number;
}

export interface ParsedOcrData {
  date: string | null;
  amount: string | null;
  transactionId: string | null;
  cardNumber: string | null;
  accountNumber: string | null;
  sourceCard: string | null;
  destCard: string | null;
  sourceIban: string | null;
  destinationIban: string | null;
  rawText?: string;
}

export interface OcrProcessResult {
  success: boolean;
  texts: string[];
  parsed: ParsedOcrData;
  raw?: string;
  processing_time_ms?: number;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly ocrServiceUrl: string;
  private readonly ocrFeedbackUrl: string;
  private readonly ocrHealthUrl: string;
  private readonly ocrTrainStatusUrl: string;
  private readonly ocrTrainTriggerUrl: string;
  private readonly timeout: number;
  private readonly feedbackEnabled: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    const ocrConfig = this.configService.get("ocr");
    this.ocrServiceUrl = ocrConfig?.serviceUrl || "http://ocr-worker:8000/ocr";
    this.ocrFeedbackUrl = ocrConfig?.feedbackUrl || "http://ocr-worker:8000/ocr/feedback";
    this.ocrHealthUrl = ocrConfig?.healthUrl || "http://ocr-worker:8000/health";
    this.ocrTrainStatusUrl = ocrConfig?.trainStatusUrl || "http://ocr-worker:8000/train/status";
    this.ocrTrainTriggerUrl = ocrConfig?.trainTriggerUrl || "http://ocr-worker:8000/train/trigger";
    this.timeout = ocrConfig?.timeout || 120000;
    this.feedbackEnabled = ocrConfig?.feedbackEnabled !== false;
    this.logger.log(`OCR Service URL: ${this.ocrServiceUrl}`);
  }

  async processImage(base64Image: string): Promise<OcrProcessResult> {
    if (!base64Image) {
      throw new BadRequestException("No image data provided");
    }

    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    try {
      this.logger.log("Sending image to OCR service...");

      const response = await firstValueFrom(
        this.httpService
          .post<OcrResult>(
            this.ocrServiceUrl,
            {
              base64_image: cleanBase64,
              language: "fa",
              detect_orientation: true,
            },
            {
              timeout: this.timeout,
              headers: { "Content-Type": "application/json" },
            }
          )
          .pipe(
            catchError((error) => {
              this.logger.error(`OCR service error: ${error.message}`);
              throw error;
            })
          )
      );

      const { success, texts = [], processing_time_ms } = response.data;

      if (!success) {
        this.logger.warn("OCR service returned success=false");
        return {
          success: false,
          texts: [],
          parsed: this.emptyParsed(),
        };
      }

      const parsed = this.parseTexts(texts);
      parsed.rawText = texts.join("\n");

      this.logger.log(
        `OCR completed: ${texts.length} lines in ${processing_time_ms ?? "?"}ms`
      );

      return {
        success: true,
        texts,
        parsed,
        raw: texts.join("\n"),
        processing_time_ms,
      };
    } catch (error: any) {
      this.logger.error(`OCR service call failed: ${error.message}`);
      return {
        success: false,
        texts: [],
        parsed: this.emptyParsed(),
        raw: `Error: ${error.message}`,
      };
    }
  }

  async sendFeedback(
    imageBase64: string,
    originalTexts: string[],
    correctedTexts: string[],
    jobId?: string
  ): Promise<boolean> {
    if (!this.feedbackEnabled) {
      this.logger.warn("OCR feedback is disabled");
      return false;
    }

    try {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      await firstValueFrom(
        this.httpService.post(
          this.ocrFeedbackUrl,
          {
            image_base64: cleanBase64,
            original_texts: originalTexts,
            corrected_texts: correctedTexts,
            job_id: jobId,
          },
          { timeout: 10000 }
        )
      );
      this.logger.log(`Feedback sent: ${correctedTexts.length} corrections`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send OCR feedback: ${error.message}`);
      return false;
    }
  }

  async getHealth(): Promise<OcrHealthResponse | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OcrHealthResponse>(this.ocrHealthUrl, {
          timeout: 5000,
        })
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async getTrainStatus(): Promise<OcrTrainStatusResponse | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OcrTrainStatusResponse>(this.ocrTrainStatusUrl, {
          timeout: 5000,
        })
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async triggerTrain(): Promise<{ status: string } | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ status: string }>(
          this.ocrTrainTriggerUrl,
          {},
          { timeout: 5000 }
        )
      );
      return response.data;
    } catch {
      return null;
    }
  }

  private emptyParsed(): ParsedOcrData {
    return {
      date: null,
      amount: null,
      transactionId: null,
      cardNumber: null,
      accountNumber: null,
      sourceCard: null,
      destCard: null,
      sourceIban: null,
      destinationIban: null,
    };
  }

  private normalizePersianText(text: string): string {
    if (!text) return "";

    const persianDigits: Record<string, string> = {
      "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
      "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
      "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
      "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    };

    const characterMap: Record<string, string> = {
      ة: "غ", أ: "ا", إ: "ا", ؤ: "و", ى: "ی",
      ي: "ی", ك: "ک", ۀ: "ه", ئ: "ی", ء: "", ـ: "",
    };

    let normalized = text;
    for (const [persian, english] of Object.entries(persianDigits)) {
      normalized = normalized.replace(new RegExp(persian, "g"), english);
    }
    for (const [bad, good] of Object.entries(characterMap)) {
      normalized = normalized.replace(new RegExp(bad, "g"), good);
    }
    return normalized.replace(/\s+/g, " ").trim();
  }

  private parseTexts(lines: string[]): ParsedOcrData {
    if (!lines || lines.length === 0) {
      return this.emptyParsed();
    }

    const cleanedLines = lines
      .map((line) => this.normalizePersianText(line))
      .filter((line) => line.length > 0);

    if (cleanedLines.length === 0) {
      return this.emptyParsed();
    }

    const fullText = cleanedLines.join(" ");
    const result = this.emptyParsed();

    this.extractCardNumber(fullText, cleanedLines, result);
    this.extractAccountNumber(fullText, cleanedLines, result);
    this.extractAmount(fullText, cleanedLines, result);
    this.extractDate(fullText, cleanedLines, result);
    this.extractTransactionId(fullText, cleanedLines, result);
    this.extractSourceDestCards(fullText, cleanedLines, result);
    this.extractIban(fullText, cleanedLines, result);

    return result;
  }

  // ---- Extraction helpers (unchanged) ----

  private extractCardNumber(fullText: string, lines: string[], result: ParsedOcrData): void {
    const patterns = [
      /(?<!\d)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})(?!\d)/g,
      /(?<!\d)(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})(?!\d)/g,
      /(?<!\d)(\d{16})(?!\d)/g,
    ];
    const cardNumberRegex = /شماره\s*کارت|شماره\s*كارت|Card\s*No|Card\s*Number/i;
    for (const line of lines) {
      if (cardNumberRegex.test(line)) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const fullMatch = match[0].replace(/[-\s]/g, "");
            if (fullMatch.length >= 16) {
              result.cardNumber = fullMatch.substring(0, 16);
              return;
            }
          }
        }
      }
    }
    for (const pattern of patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const fullMatch = match[0].replace(/[-\s]/g, "");
        if (fullMatch.length >= 16) {
          result.cardNumber = fullMatch.substring(0, 16);
          return;
        }
      }
    }
    for (const line of lines) {
      const numbers = line.replace(/[^\d]/g, "");
      if (numbers.length >= 16) {
        result.cardNumber = numbers.substring(0, 16);
        return;
      }
    }
  }

  private extractAccountNumber(fullText: string, lines: string[], result: ParsedOcrData): void {
    const accountRegex = /شماره\s*حساب|Account\s*No|Account\s*Number|حساب|شبا|IBAN/i;
    for (const line of lines) {
      if (accountRegex.test(line)) {
        const numbers = line.replace(/[^\d]/g, "");
        if (numbers.length >= 6 && numbers.length <= 24) {
          result.accountNumber = numbers;
          return;
        }
      }
    }
    const accountPattern = /(?:شماره\s*حساب|Account|حساب|شبا|IBAN)[\s:]*(\d{6,24})/i;
    const match = fullText.match(accountPattern);
    if (match) {
      result.accountNumber = match[1];
    }
  }

  private extractAmount(fullText: string, lines: string[], result: ParsedOcrData): void {
    const amountPatterns = [
      /مبلغ\s*[:]*\s*([\d,]+)\s*(?:ریال|ريال|تومان|Rial|Toman|IRT)/i,
      /([\d,]+)\s*(?:ریال|ريال|تومان|Rial|Toman|IRT)/i,
      /(?:ریال|ريال|تومان|Rial|Toman|IRT)\s*([\d,]+)/i,
      /قابل\s*پرداخت\s*[:]*\s*([\d,]+)/i,
      /جمع\s*[:]*\s*([\d,]+)/i,
      /Total\s*[:]*\s*([\d,]+)/i,
      /Price\s*[:]*\s*([\d,]+)/i,
      /value\s*[:]*\s*([\d,]+)/i,
    ];
    for (const pattern of amountPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const amount = match[1].replace(/,/g, "");
        if (!isNaN(Number(amount)) && Number(amount) > 0) {
          result.amount = amount;
          return;
        }
      }
    }
    const numberMatches = fullText.match(/\b\d{4,15}\b/g);
    if (numberMatches) {
      const amounts = numberMatches
        .map((n) => n.replace(/,/g, ""))
        .filter((n) => !isNaN(Number(n)) && Number(n) > 1000 && Number(n) < 1e12)
        .map((n) => Number(n))
        .sort((a, b) => b - a);
      if (amounts.length > 0) {
        result.amount = String(amounts[0]);
      }
    }
  }

  private extractDate(fullText: string, lines: string[], result: ParsedOcrData): void {
    const datePatterns = [
      /تاریخ\s*[:]*\s*(\d{2,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4})/i,
      /Date\s*[:]*\s*(\d{2,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4})/i,
      /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/,
      /(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/,
    ];
    for (const pattern of datePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        result.date = match[1];
        return;
      }
    }
    const persianMonths = [
      "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
      "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
    ];
    for (let i = 0; i < lines.length; i++) {
      for (const month of persianMonths) {
        if (lines[i].includes(month)) {
          const nearbyText = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(" ");
          const numbers = nearbyText.match(/\b(\d{1,2})\b/g);
          const years = nearbyText.match(/\b(\d{2,4})\b/g);
          if (numbers && years) {
            const day = numbers[0];
            const year = years[years.length - 1] || "????";
            result.date = `${year}/${month}/${day}`;
            return;
          }
        }
      }
    }
  }

  private extractTransactionId(fullText: string, lines: string[], result: ParsedOcrData): void {
    const txPatterns = [
      /(?:پیگیری|پيگيری|Tracking|Ref|Reference|شماره\s*پیگیری|شماره\s*تراکنش|کد\s*پیگیری|کد\s*رهگیری|مرجع|سفارش)[\s:]*([A-Za-z0-9]{4,20})/i,
      /\b([A-Z0-9]{6,20})\b/,
    ];
    for (const pattern of txPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        result.transactionId = match[1];
        return;
      }
    }
    const txKeywords = /پیگیری|پيگيری|Tracking|Ref|Reference|کد|Code|شماره|ID|No|Ref/i;
    for (const line of lines) {
      if (txKeywords.test(line)) {
        const code = line.replace(/[^A-Za-z0-9]/g, "");
        if (code.length >= 4 && code.length <= 20) {
          result.transactionId = code;
          return;
        }
      }
    }
  }

  private extractSourceDestCards(fullText: string, lines: string[], result: ParsedOcrData): void {
    const sourcePatterns = [
      /(?:مبدا|مبدأ|مبداء|Source|Origin|از)[\s:]*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
      /از\s*([^\d]*?)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
    ];
    for (const pattern of sourcePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const cardNumber = match.slice(1).join("").replace(/[^0-9]/g, "");
        if (cardNumber.length >= 16) {
          result.sourceCard = cardNumber.substring(0, 16);
          break;
        }
      }
    }
    const destPatterns = [
      /(?:مقصد|Destination|به|Target)[\s:]*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
      /به\s*([^\d]*?)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
    ];
    for (const pattern of destPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const cardNumber = match.slice(1).join("").replace(/[^0-9]/g, "");
        if (cardNumber.length >= 16) {
          result.destCard = cardNumber.substring(0, 16);
          break;
        }
      }
    }
    if (!result.sourceCard && !result.destCard && result.cardNumber) {
      for (const line of lines) {
        if (/مبدا|مبدأ|Source|Origin|از/.test(line)) {
          const numbers = line.replace(/[^\d]/g, "");
          if (numbers.length >= 16) {
            result.sourceCard = numbers.substring(0, 16);
          }
        } else if (/مقصد|Destination|به|Target/.test(line)) {
          const numbers = line.replace(/[^\d]/g, "");
          if (numbers.length >= 16) {
            result.destCard = numbers.substring(0, 16);
          }
        }
      }
    }
  }

  private extractIban(fullText: string, lines: string[], result: ParsedOcrData): void {
    const ibanPattern = /\bIR\s*[0-9\s]{24,26}\b/i;
    const ibanCleanPattern = /\b(IR)(\d{2})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})?\b/i;
    const ibanFlatPattern = /\b(IR\d{24})\b/i;

    const extractIbanNumber = (text: string): string | null => {
      let match = text.match(ibanFlatPattern);
      if (match) return match[1].toUpperCase();
      match = text.match(ibanCleanPattern);
      if (match) {
        const digits = match.slice(2).join("").replace(/\s/g, "");
        if (digits.length >= 24) return "IR" + digits.substring(0, 24);
      }
      match = text.match(ibanPattern);
      if (match) {
        const cleaned = match[0].replace(/\s/g, "").toUpperCase();
        if (cleaned.startsWith("IR") && cleaned.length >= 26) return cleaned.substring(0, 26);
      }
      return null;
    };

    const sourceKeywords = /مبدا|مبدأ|مبداء|Source|Origin|از|شبا\s*مبدا|شبا\s*مبدأ/i;
    const destKeywords = /مقصد|Destination|به|Target|شبا\s*مقصد/i;

    for (const line of lines) {
      if (sourceKeywords.test(line) && !destKeywords.test(line)) {
        const iban = extractIbanNumber(line);
        if (iban) {
          result.sourceIban = iban;
          break;
        }
      }
    }

    for (const line of lines) {
      if (destKeywords.test(line) && !sourceKeywords.test(line)) {
        const iban = extractIbanNumber(line);
        if (iban) {
          result.destinationIban = iban;
          break;
        }
      }
    }

    if (!result.sourceIban && !result.destinationIban) {
      const ibans: string[] = [];
      const allMatches = fullText.match(/\bIR[0-9\s]{24,26}\b/gi);
      if (allMatches) {
        for (const m of allMatches) {
          const cleaned = m.replace(/\s/g, "").toUpperCase();
          if (cleaned.startsWith("IR") && cleaned.length >= 26) {
            ibans.push(cleaned.substring(0, 26));
          }
        }
      }
      if (ibans.length === 1) {
        result.destinationIban = ibans[0];
      } else if (ibans.length >= 2) {
        result.sourceIban = ibans[0];
        result.destinationIban = ibans[1];
      }
    }
  }
}
