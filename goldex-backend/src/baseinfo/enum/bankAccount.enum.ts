export enum IranianBank {
  // First table - Credit Institutions & BiNational Bank
  MELAL = "MELAL",
  KHAVARMIANEH = "KHAVARMIANEH",
  NOOR = "NOOR",
  IRAN_VENEZUELA = "IRAN_VENEZUELA",

  // Second table - Private & Specialized Banks
  KARAFARIN = "KARAFARIN",
  PARSIAN = "PARSIAN",
  EGHTESAD_NOVIN = "EGHTESAD_NOVIN",
  SAMAN = "SAMAN",
  PASARGAD = "PASARGAD",
  SARMAYEH = "SARMAYEH",
  SINA = "SINA",
  MEHR_IRAN = "MEHR_IRAN",
  SHAHR = "SHAHR",
  AYANDEH = "AYANDEH",
  GARDESHGARI = "GARDESHGARI",
  DAY = "DAY",
  IRANZAMIN = "IRANZAMIN",
  RESALAT = "RESALAT",

  // Third table - Government & State-owned Banks
  MARKAZI = "MARKAZI",
  SANAT_VA_MADAN = "SANAT_VA_MADAN",
  MELLAT = "MELLAT",
  REFAH = "REFAH",
  MASKAN = "MASKAN",
  SEPAH = "SEPAH",
  KESHAVARZI = "KESHAVARZI",
  MELLI = "MELLI",
  TEJARAT = "TEJARAT",
  SADERAT = "SADERAT",
  TOSEAH_SADERAT = "TOSEAH_SADERAT",
  POST = "POST",
  TOSEAH_TAAVON = "TOSEAH_TAAVON",
}

// Helper function to get official name by enum value
export function getIranianBankOfficialName(code: string): string | undefined {
  const officialNames: Record<string, string> = {
    MELAL: "Melal Credit Institution",
    KHAVARMIANEH: "Middle East Bank",
    NOOR: "Noor Credit Institution",
    IRAN_VENEZUELA: "Iran-Venezuela BiNational Bank",
    KARAFARIN: "Karafarin Bank",
    PARSIAN: "Parsian Bank",
    EGHTESAD_NOVIN: "Bank Eghtesad Novin",
    SAMAN: "Saman Bank",
    PASARGAD: "Bank Pasargad",
    SARMAYEH: "Sarmayeh Bank",
    SINA: "Sina Bank",
    MEHR_IRAN: "Gharzolhasane Mehr Iran Bank",
    SHAHR: "Shahr Bank",
    AYANDEH: "Ayandeh Bank",
    GARDESHGARI: "Tourism Bank",
    DAY: "Day Bank",
    IRANZAMIN: "Iran Zamin Bank",
    RESALAT: "Resalat Gharzolhasane Bank",
    MARKAZI: "Central Bank of the Islamic Republic of Iran",
    SANAT_VA_MADAN: "Bank of Industry & Mine",
    MELLAT: "Bank Mellat",
    REFAH: "Refah K. Bank",
    MASKAN: "Bank Maskan",
    SEPAH: "Bank Sepah",
    KESHAVARZI: "Bank Keshavarzi Iran",
    MELLI: "Bank Melli Iran",
    TEJARAT: "Tejarat Bank",
    SADERAT: "Bank Saderat Iran",
    TOSEAH_SADERAT: "Export Development Bank of Iran",
    POST: "Post Bank Iran",
    TOSEAH_TAAVON: "Tose'e Ta'avon Bank",
  };

  return officialNames[code];
}
