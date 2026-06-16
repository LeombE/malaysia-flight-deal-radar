INSERT OR REPLACE INTO airports (
  iata_code,
  airport_name,
  city,
  country_code,
  region_group,
  airport_type,
  is_origin,
  active
) VALUES
  ('JHB', 'Senai International Airport / Johor Bahru', 'Johor Bahru', 'MY', 'MALAYSIA_ORIGIN', 'medium_airport', 1, 1),
  ('KUL', 'Kuala Lumpur International Airport / KLIA / KLIA2', 'Kuala Lumpur', 'MY', 'MALAYSIA_ORIGIN', 'large_airport', 1, 1),
  ('SZB', 'Subang / Sultan Abdul Aziz Shah Airport', 'Subang', 'MY', 'MALAYSIA_ORIGIN', 'medium_airport', 1, 1),
  ('SIN', 'Singapore Changi Airport', 'Singapore', 'SG', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('BKK', 'Suvarnabhumi Airport', 'Bangkok', 'TH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('DMK', 'Don Mueang International Airport', 'Bangkok', 'TH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('HKT', 'Phuket International Airport', 'Phuket', 'TH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('SGN', 'Tan Son Nhat International Airport', 'Ho Chi Minh City', 'VN', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('HAN', 'Noi Bai International Airport', 'Hanoi', 'VN', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('DAD', 'Da Nang International Airport', 'Da Nang', 'VN', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('DPS', 'Ngurah Rai International Airport', 'Denpasar', 'ID', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('CGK', 'Soekarno-Hatta International Airport', 'Jakarta', 'ID', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('MNL', 'Ninoy Aquino International Airport', 'Manila', 'PH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('CEB', 'Mactan-Cebu International Airport', 'Cebu', 'PH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('PNH', 'Phnom Penh International Airport', 'Phnom Penh', 'KH', 'SOUTHEAST_ASIA', 'large_airport', 0, 1),
  ('TPE', 'Taiwan Taoyuan International Airport', 'Taipei', 'TW', 'TAIWAN', 'large_airport', 0, 1),
  ('TSA', 'Taipei Songshan Airport', 'Taipei', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('KHH', 'Kaohsiung International Airport', 'Kaohsiung', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('RMQ', 'Taichung International Airport', 'Taichung', 'TW', 'TAIWAN', 'medium_airport', 0, 1),
  ('NRT', 'Narita International Airport', 'Tokyo', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('HND', 'Tokyo Haneda Airport', 'Tokyo', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('KIX', 'Kansai International Airport', 'Osaka', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('NGO', 'Chubu Centrair International Airport', 'Nagoya', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('FUK', 'Fukuoka Airport', 'Fukuoka', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('CTS', 'New Chitose Airport', 'Sapporo', 'JP', 'JAPAN', 'large_airport', 0, 1),
  ('ICN', 'Incheon International Airport', 'Seoul', 'KR', 'SOUTH_KOREA', 'large_airport', 0, 1),
  ('PUS', 'Gimhae International Airport', 'Busan', 'KR', 'SOUTH_KOREA', 'large_airport', 0, 1),
  ('PVG', 'Shanghai Pudong International Airport', 'Shanghai', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('SHA', 'Shanghai Hongqiao International Airport', 'Shanghai', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('PEK', 'Beijing Capital International Airport', 'Beijing', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('PKX', 'Beijing Daxing International Airport', 'Beijing', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('CAN', 'Guangzhou Baiyun International Airport', 'Guangzhou', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('SZX', 'Shenzhen Baoan International Airport', 'Shenzhen', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('XMN', 'Xiamen Gaoqi International Airport', 'Xiamen', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('HGH', 'Hangzhou Xiaoshan International Airport', 'Hangzhou', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('TFU', 'Chengdu Tianfu International Airport', 'Chengdu', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('CTU', 'Chengdu Shuangliu International Airport', 'Chengdu', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('CKG', 'Chongqing Jiangbei International Airport', 'Chongqing', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1),
  ('KMG', 'Kunming Changshui International Airport', 'Kunming', 'CN', 'MAINLAND_CHINA', 'large_airport', 0, 1);

INSERT OR IGNORE INTO route_candidates (
  origin_iata,
  destination_iata,
  country_code,
  region_group,
  priority,
  source,
  active
)
SELECT
  origins.iata_code,
  destinations.iata_code,
  destinations.country_code,
  destinations.region_group,
  CASE
    WHEN origins.iata_code = 'KUL' THEN 10
    WHEN origins.iata_code = 'JHB' THEN 30
    ELSE 50
  END,
  'seed',
  1
FROM airports origins
JOIN airports destinations
WHERE origins.is_origin = 1
  AND destinations.is_origin = 0
  AND destinations.active = 1;
