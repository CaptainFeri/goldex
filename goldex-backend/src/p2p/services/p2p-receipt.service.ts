import { Injectable, Logger } from "@nestjs/common";
import { MinioService } from "../../minio/minio.service";
import { P2pPaymentProofEntity } from "../entity/p2p-payment-proof.entity";

/** How long a receipt link stays valid, in seconds. */
const RECEIPT_URL_TTL = 300;

export type ProofView = Omit<P2pPaymentProofEntity, "receiptObjectName"> & {
  receiptUrl: string | null;
};

/**
 * Receipts live in MinIO under an object name that is useless to a client on
 * its own. Both the withdrawer deciding whether to confirm and the admin
 * reviewing a dispute need to actually look at the image, so it is handed out
 * as a short-lived presigned URL rather than a permanently public one
 * (spec §12.1).
 */
@Injectable()
export class P2pReceiptService {
  private readonly logger = new Logger(P2pReceiptService.name);

  constructor(private readonly minio: MinioService) {}

  async attachUrl<T extends P2pPaymentProofEntity | null | undefined>(
    proof: T,
  ): Promise<T extends null | undefined ? null : ProofView> {
    if (!proof) return null as any;

    let receiptUrl: string | null = null;
    if (proof.receiptObjectName) {
      try {
        receiptUrl = await this.minio.getPresignedUrl({
          objectName: proof.receiptObjectName,
          expires: RECEIPT_URL_TTL,
        });
      } catch (err) {
        // A missing object must not blank out the rest of the receipt.
        this.logger.warn(
          `Could not sign receipt ${proof.receiptObjectName}: ${(err as Error).message}`,
        );
      }
    }

    const { receiptObjectName, ...rest } = proof;
    return { ...rest, receiptUrl } as any;
  }

  /** Same, for a list — signing runs in parallel. */
  async attachUrls(proofs: (P2pPaymentProofEntity | null | undefined)[]): Promise<(ProofView | null)[]> {
    return Promise.all(proofs.map((p) => this.attachUrl(p)));
  }
}
