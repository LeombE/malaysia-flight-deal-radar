export interface AirportSeed {
  iata_code: string;
  airport_name: string;
  city: string;
  country_code: string;
  region_group: string;
  active: boolean;
  is_origin: boolean;
}

export const originAirportSeeds: AirportSeed[] = [
  {
    iata_code: "JHB",
    airport_name: "Senai International Airport / Johor Bahru",
    city: "Johor Bahru",
    country_code: "MY",
    region_group: "MALAYSIA_ORIGIN",
    active: true,
    is_origin: true
  },
  {
    iata_code: "KUL",
    airport_name: "Kuala Lumpur International Airport / KLIA / KLIA2",
    city: "Kuala Lumpur",
    country_code: "MY",
    region_group: "MALAYSIA_ORIGIN",
    active: true,
    is_origin: true
  },
  {
    iata_code: "SZB",
    airport_name: "Subang / Sultan Abdul Aziz Shah Airport",
    city: "Subang",
    country_code: "MY",
    region_group: "MALAYSIA_ORIGIN",
    active: true,
    is_origin: true
  }
];

export const destinationAirportSeeds: AirportSeed[] = [
  { iata_code: "SIN", airport_name: "Singapore Changi Airport", city: "Singapore", country_code: "SG", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "BKK", airport_name: "Suvarnabhumi Airport", city: "Bangkok", country_code: "TH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "DMK", airport_name: "Don Mueang International Airport", city: "Bangkok", country_code: "TH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "HKT", airport_name: "Phuket International Airport", city: "Phuket", country_code: "TH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "SGN", airport_name: "Tan Son Nhat International Airport", city: "Ho Chi Minh City", country_code: "VN", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "HAN", airport_name: "Noi Bai International Airport", city: "Hanoi", country_code: "VN", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "DAD", airport_name: "Da Nang International Airport", city: "Da Nang", country_code: "VN", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "DPS", airport_name: "Ngurah Rai International Airport", city: "Denpasar", country_code: "ID", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "CGK", airport_name: "Soekarno-Hatta International Airport", city: "Jakarta", country_code: "ID", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "MNL", airport_name: "Ninoy Aquino International Airport", city: "Manila", country_code: "PH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "CEB", airport_name: "Mactan-Cebu International Airport", city: "Cebu", country_code: "PH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "PNH", airport_name: "Phnom Penh International Airport", city: "Phnom Penh", country_code: "KH", region_group: "SOUTHEAST_ASIA", active: true, is_origin: false },
  { iata_code: "TPE", airport_name: "Taiwan Taoyuan International Airport", city: "Taipei", country_code: "TW", region_group: "TAIWAN", active: true, is_origin: false },
  { iata_code: "TSA", airport_name: "Taipei Songshan Airport", city: "Taipei", country_code: "TW", region_group: "TAIWAN", active: true, is_origin: false },
  { iata_code: "KHH", airport_name: "Kaohsiung International Airport", city: "Kaohsiung", country_code: "TW", region_group: "TAIWAN", active: true, is_origin: false },
  { iata_code: "RMQ", airport_name: "Taichung International Airport", city: "Taichung", country_code: "TW", region_group: "TAIWAN", active: true, is_origin: false },
  { iata_code: "NRT", airport_name: "Narita International Airport", city: "Tokyo", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "HND", airport_name: "Tokyo Haneda Airport", city: "Tokyo", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "KIX", airport_name: "Kansai International Airport", city: "Osaka", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "NGO", airport_name: "Chubu Centrair International Airport", city: "Nagoya", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "FUK", airport_name: "Fukuoka Airport", city: "Fukuoka", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "CTS", airport_name: "New Chitose Airport", city: "Sapporo", country_code: "JP", region_group: "JAPAN", active: true, is_origin: false },
  { iata_code: "ICN", airport_name: "Incheon International Airport", city: "Seoul", country_code: "KR", region_group: "SOUTH_KOREA", active: true, is_origin: false },
  { iata_code: "PUS", airport_name: "Gimhae International Airport", city: "Busan", country_code: "KR", region_group: "SOUTH_KOREA", active: true, is_origin: false },
  { iata_code: "PVG", airport_name: "Shanghai Pudong International Airport", city: "Shanghai", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "SHA", airport_name: "Shanghai Hongqiao International Airport", city: "Shanghai", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "PEK", airport_name: "Beijing Capital International Airport", city: "Beijing", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "PKX", airport_name: "Beijing Daxing International Airport", city: "Beijing", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "CAN", airport_name: "Guangzhou Baiyun International Airport", city: "Guangzhou", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "SZX", airport_name: "Shenzhen Baoan International Airport", city: "Shenzhen", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "XMN", airport_name: "Xiamen Gaoqi International Airport", city: "Xiamen", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "HGH", airport_name: "Hangzhou Xiaoshan International Airport", city: "Hangzhou", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "TFU", airport_name: "Chengdu Tianfu International Airport", city: "Chengdu", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "CTU", airport_name: "Chengdu Shuangliu International Airport", city: "Chengdu", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "CKG", airport_name: "Chongqing Jiangbei International Airport", city: "Chongqing", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false },
  { iata_code: "KMG", airport_name: "Kunming Changshui International Airport", city: "Kunming", country_code: "CN", region_group: "MAINLAND_CHINA", active: true, is_origin: false }
];

export const airportSeeds: AirportSeed[] = [...originAirportSeeds, ...destinationAirportSeeds];
