import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { catchError } from "rxjs/operators";

interface OcrResult {
  success: boolean;
  texts: string[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface ParsedOcrData {
  date: string | null;
  amount: string | null;
  transactionId: string | null;
  cardNumber: string | null;
  accountNumber: string | null;
  sourceCard: string | null;
  destCard: string | null;
  rawText?: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly ocrServiceUrl: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    const ocrConfig = this.configService.get("ocr");
    this.ocrServiceUrl = ocrConfig?.serviceUrl || "http://localhost:8000/ocr";
    this.timeout = ocrConfig?.timeout || 30000;
    this.logger.log(`OCR Service URL: ${this.ocrServiceUrl}`);
  }

  private get serviceUrl(): string {
    return this.ocrServiceUrl;
  }

  async processImage(base64Image: string): Promise<{
    success: boolean;
    texts: string[];
    parsed: ParsedOcrData;
    raw?: string;
  }> {
    if (!base64Image) {
      throw new BadRequestException("No image data provided");
    }

    // Remove data URL prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    try {
      this.logger.log("Sending image to OCR service...");

      const url = this.serviceUrl;
      const response = await firstValueFrom(
        this.httpService
          .post<OcrResult>(
            url,
            {
              base64_image: cleanBase64,
              language: "fa", // Persian language detection
              detect_orientation: true,
            },
            {
              timeout: this.timeout,
              headers: {
                "Content-Type": "application/json",
              },
            }
          )
          .pipe(
            catchError((error) => {
              this.logger.error(`OCR service error: ${error.message}`);
              throw error;
            })
          )
      );

      this.logger.log(`OCR response received: ${response}`);

      const { success, texts = [] } = response.data;

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

      this.logger.log(`OCR completed: ${texts.length} lines extracted`);

      return {
        success: true,
        texts,
        parsed,
        raw: texts.join("\n"),
      };
    } catch (error: any) {
      this.logger.error(`OCR service call failed: ${error.message}`);
      this.logger.error(`Error details: ${JSON.stringify(error.response?.data || error.stack)}`);

      // Return a structured error response
      return {
        success: false,
        texts: [],
        parsed: this.emptyParsed(),
        raw: `Error: ${error.message}`,
      };
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
    };
  }

  private normalizePersianText(text: string): string {
    if (!text) return "";

    // Persian to English digit mapping
    const persianDigits: Record<string, string> = {
      "۰": "0",
      "۱": "1",
      "۲": "2",
      "۳": "3",
      "۴": "4",
      "۵": "5",
      "۶": "6",
      "۷": "7",
      "۸": "8",
      "۹": "9",
      "٠": "0",
      "١": "1",
      "٢": "2",
      "٣": "3",
      "٤": "4",
      "٥": "5",
      "٦": "6",
      "٧": "7",
      "٨": "8",
      "٩": "9",
    };

    // Common OCR mistakes
    const characterMap: Record<string, string> = {
      ة: "غ",
      أ: "ا",
      إ: "ا",
      ؤ: "و",
      ى: "ی",
      ي: "ی",
      ك: "ک",
      ۀ: "ه",
      ئ: "ی",
      ء: "",
      ـ: "",
    };

    let normalized = text;

    // Replace Persian/Arabic digits
    for (const [persian, english] of Object.entries(persianDigits)) {
      normalized = normalized.replace(new RegExp(persian, "g"), english);
    }

    // Replace common character mistakes
    for (const [bad, good] of Object.entries(characterMap)) {
      normalized = normalized.replace(new RegExp(bad, "g"), good);
    }

    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
  }

  private parseTexts(lines: string[]): ParsedOcrData {
    if (!lines || lines.length === 0) {
      this.logger.warn("No lines to parse");
      return this.emptyParsed();
    }

    // Clean and normalize all lines
    const cleanedLines = lines.map((line) => this.normalizePersianText(line)).filter((line) => line.length > 0);

    if (cleanedLines.length === 0) {
      this.logger.warn("No valid text after cleaning");
      return this.emptyParsed();
    }

    const fullText = cleanedLines.join(" ");
    // this.logger.debug(`Full text for parsing: ${fullText.substring(0, 200)}...`);
    this.logger.debug(`Full text for parsing: ${fullText}...`);

    const result = this.emptyParsed();

    // Extract data using patterns
    this.extractCardNumber(fullText, cleanedLines, result);
    this.extractAccountNumber(fullText, cleanedLines, result);
    this.extractAmount(fullText, cleanedLines, result);
    this.extractDate(fullText, cleanedLines, result);
    this.extractTransactionId(fullText, cleanedLines, result);
    this.extractSourceDestCards(fullText, cleanedLines, result);

    this.logger.debug(`Parsed result: ${JSON.stringify(result)}`);
    return result;
  }

  private extractCardNumber(fullText: string, lines: string[], result: ParsedOcrData): void {
    // Pattern for 16-digit card number (with or without spaces/hyphens)
    const patterns = [
      /(?<!\d)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})(?!\d)/g,
      /(?<!\d)(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})(?!\d)/g,
      /(?<!\d)(\d{16})(?!\d)/g,
    ];

    // First try to find with "شماره کارت" keyword
    const cardNumberRegex = /شماره\s*کارت|شماره\s*كارت|Card\s*No|Card\s*Number/i;
    for (const line of lines) {
      if (cardNumberRegex.test(line)) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const fullMatch = match[0].replace(/[-\s]/g, "");
            if (fullMatch.length >= 16) {
              result.cardNumber = fullMatch.substring(0, 16);
              this.logger.debug(`Found card number with keyword: ${result.cardNumber}`);
              return;
            }
          }
        }
      }
    }

    // Then try to find any 16-digit number
    for (const pattern of patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const fullMatch = match[0].replace(/[-\s]/g, "");
        if (fullMatch.length >= 16) {
          result.cardNumber = fullMatch.substring(0, 16);
          this.logger.debug(`Found card number: ${result.cardNumber}`);
          return;
        }
      }
    }

    // Search line by line for 16-digit numbers
    for (const line of lines) {
      const numbers = line.replace(/[^\d]/g, "");
      if (numbers.length >= 16) {
        result.cardNumber = numbers.substring(0, 16);
        this.logger.debug(`Found card number from line: ${result.cardNumber}`);
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
          this.logger.debug(`Found account number: ${result.accountNumber}`);
          return;
        }
      }
    }

    // Fallback: look for 6-24 digit numbers near account keywords
    const accountPattern = /(?:شماره\s*حساب|Account|حساب|شبا|IBAN)[\s:]*(\d{6,24})/i;
    const match = fullText.match(accountPattern);
    if (match) {
      result.accountNumber = match[1];
      this.logger.debug(`Found account number from pattern: ${result.accountNumber}`);
    }
  }

  private extractAmount(fullText: string, lines: string[], result: ParsedOcrData): void {
    // Look for amount with currency indicators
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
          this.logger.debug(`Found amount: ${result.amount}`);
          return;
        }
      }
    }

    // Look for standalone large numbers
    const numberMatches = fullText.match(/\b\d{4,15}\b/g);
    if (numberMatches) {
      const amounts = numberMatches
        .map((n) => n.replace(/,/g, ""))
        .filter((n) => !isNaN(Number(n)) && Number(n) > 1000 && Number(n) < 1e12)
        .map((n) => Number(n))
        .sort((a, b) => b - a);

      if (amounts.length > 0) {
        result.amount = String(amounts[0]);
        this.logger.debug(`Found amount from numbers: ${result.amount}`);
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
        this.logger.debug(`Found date: ${result.date}`);
        return;
      }
    }

    // Look for Persian month names
    const persianMonths = [
      "فروردین",
      "اردیبهشت",
      "خرداد",
      "تیر",
      "مرداد",
      "شهریور",
      "مهر",
      "آبان",
      "آذر",
      "دی",
      "بهمن",
      "اسفند",
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const month of persianMonths) {
        if (lines[i].includes(month)) {
          // Look for day and year in nearby lines
          const nearbyText = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(" ");
          const numbers = nearbyText.match(/\b(\d{1,2})\b/g);
          const years = nearbyText.match(/\b(\d{2,4})\b/g);

          if (numbers && years) {
            const day = numbers[0];
            const year = years[years.length - 1] || "????";
            result.date = `${year}/${month}/${day}`;
            this.logger.debug(`Found date from month: ${result.date}`);
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
        this.logger.debug(`Found transaction ID: ${result.transactionId}`);
        return;
      }
    }

    // Look for alphanumeric codes in lines with keywords
    const txKeywords = /پیگیری|پيگيری|Tracking|Ref|Reference|کد|Code|شماره|ID|No|Ref/i;
    for (const line of lines) {
      if (txKeywords.test(line)) {
        const code = line.replace(/[^A-Za-z0-9]/g, "");
        if (code.length >= 4 && code.length <= 20) {
          result.transactionId = code;
          this.logger.debug(`Found transaction ID from line: ${result.transactionId}`);
          return;
        }
      }
    }
  }

  private extractSourceDestCards(fullText: string, lines: string[], result: ParsedOcrData): void {
    // Source card (مبدا)
    const sourcePatterns = [
      /(?:مبدا|مبدأ|مبداء|Source|Origin|از)[\s:]*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
      /از\s*([^\d]*?)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
    ];

    for (const pattern of sourcePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const cardNumber = match
          .slice(1)
          .join("")
          .replace(/[^0-9]/g, "");
        if (cardNumber.length >= 16) {
          result.sourceCard = cardNumber.substring(0, 16);
          this.logger.debug(`Found source card: ${result.sourceCard}`);
          break;
        }
      }
    }

    // Dest card (مقصد)
    const destPatterns = [
      /(?:مقصد|Destination|به|Target)[\s:]*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
      /به\s*([^\d]*?)(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})\s*[-–—]?\s*(\d{4})/i,
    ];

    for (const pattern of destPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const cardNumber = match
          .slice(1)
          .join("")
          .replace(/[^0-9]/g, "");
        if (cardNumber.length >= 16) {
          result.destCard = cardNumber.substring(0, 16);
          this.logger.debug(`Found destination card: ${result.destCard}`);
          break;
        }
      }
    }

    // If no source/dest found but we have a card number, use it as both
    if (!result.sourceCard && !result.destCard && result.cardNumber) {
      // Try to determine which is which based on context
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
}
