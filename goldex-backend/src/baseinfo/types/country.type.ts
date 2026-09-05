export type countryType = {
  flags: {
    png: string;
    svg: string;
    alt: string;
  };

  name: {
    common: string;
    official: string;
    nativeName: any;
  };

  region: string;
  latlng: number[];

  ccn3: string;
  cca3: string;

  timezones: string[];

  maps: {
    googleMaps: string;
    openStreetMaps: string;
  };
};
