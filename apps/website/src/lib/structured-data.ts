import { BUSINESS_NAME, socials } from "@/constants";
import {
  address,
  email,
  latitude,
  legalName,
  longitude,
  phoneNumber,
  taxId,
} from "@/lib/constants";

const amenities = ["Free parking", "24-hour front desk", "Elevator", "Free Wi-Fi"];

export function getHotelStructuredData(url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": `${url}#hotel`,
    name: BUSINESS_NAME,
    url,
    telephone: phoneNumber,
    email,
    legalName,
    taxID: taxId,
    foundingDate: "2005",
    checkinTime: "14:00",
    checkoutTime: "11:00",
    petsAllowed: true,
    paymentAccepted: "Cash, Credit Card, Yape, Bank transfer",
    amenityFeature: amenities.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: "Churín",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude,
      longitude,
    },
    sameAs: socials.map(({ href }) => href),
  };
}

interface BreadcrumbOptions {
  pageUrl: string;
  homeUrl: string;
  homeName: string;
  pageName: string;
}

function getBreadcrumb({ pageUrl, homeUrl, homeName, pageName }: BreadcrumbOptions) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: homeName, item: homeUrl },
      { "@type": "ListItem", position: 2, name: pageName, item: pageUrl },
    ],
  };
}

interface ChurinStructuredDataOptions extends BreadcrumbOptions {
  attractions: { id: string; name: string; description: string }[];
}

export function getChurinStructuredData({
  pageUrl,
  homeUrl,
  homeName,
  pageName,
  attractions,
}: ChurinStructuredDataOptions) {
  const churin = {
    "@type": "City",
    name: "Churín",
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: "Oyón, Lima",
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      getBreadcrumb({ pageUrl, homeUrl, homeName, pageName }),
      ...attractions.map(({ id, name, description }) => ({
        "@type": "TouristAttraction",
        "@id": `${pageUrl}#${id}`,
        name,
        description,
        url: `${pageUrl}#${id}`,
        containedInPlace: churin,
      })),
    ],
  };
}

interface RoomsStructuredDataOptions extends BreadcrumbOptions {
  rooms: {
    id: string;
    name: string;
    description: string;
    bed: string;
    areaSqm: number;
  }[];
}

export function getRoomsStructuredData({ rooms, ...breadcrumb }: RoomsStructuredDataOptions) {
  const { pageUrl, homeUrl } = breadcrumb;
  const hotel = { "@id": `${homeUrl}#hotel` };

  return {
    "@context": "https://schema.org",
    "@graph": [
      getBreadcrumb(breadcrumb),
      ...rooms.map(({ id, name, description, bed, areaSqm }) => ({
        "@type": "HotelRoom",
        "@id": `${pageUrl}#room-${id}`,
        name,
        description,
        bed,
        floorSize: {
          "@type": "QuantitativeValue",
          value: areaSqm,
          unitCode: "MTK",
        },
        containedInPlace: hotel,
      })),
    ],
  };
}
