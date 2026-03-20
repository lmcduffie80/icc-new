-- Extend products table with rich detail fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS full_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating DECIMAL(2,1);
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS approved_states TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS features TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]';

-- Create index for SKU lookups
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- Update existing products with rich detail data
UPDATE products SET
  full_description = 'Our Premium Corn Seed - Hybrid 5000 represents the pinnacle of modern agricultural genetics. Developed through years of careful breeding and testing, this hybrid variety offers exceptional yield potential while maintaining robust resistance to common diseases and environmental stresses. Perfect for both commercial operations and family farms looking to maximize their corn production.',
  sku = 'CS-H5000',
  rating = 4.8,
  review_count = 127,
  attributes = '{"activeIngredients": "N/A - Natural Hybrid Seed", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "32,000-36,000 seeds per acre", "containerSizes": "50 lb bag, 80,000 kernel bag", "availabilityDate": "September 2024"}',
  approved_states = ARRAY['IA', 'IL', 'IN', 'NE', 'MN', 'OH', 'SD', 'ND', 'KS', 'MO', 'WI', 'MI'],
  features = ARRAY['Exceptional drought resistance', 'Disease tolerant genetics', 'High yield potential (200+ bu/acre)', 'Excellent standability', 'Fast dry-down for early harvest'],
  specifications = '{"Maturity": "110-115 days", "Plant Height": "8-9 feet", "Ear Length": "8-9 inches", "Kernel Depth": "Deep", "Recommended Population": "32,000-36,000 plants/acre"}',
  documents = '[{"name": "Product Label", "url": "/docs/label.pdf"}, {"name": "Safety Data Sheet", "url": "/docs/sds.pdf"}, {"name": "Technical Bulletin", "url": "/docs/technical.pdf"}]'
WHERE id = '1';

UPDATE products SET
  full_description = 'This premium organic nitrogen fertilizer provides consistent, long-lasting nutrition for your crops while building soil health. The slow-release formula ensures nutrients are available throughout the growing season, reducing the risk of leaching and providing better value for your investment.',
  sku = 'FERT-ON-001',
  rating = 4.6,
  review_count = 89,
  attributes = '{"activeIngredients": "Organic Nitrogen Compounds 10%", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "20-40 lbs per 1,000 sq ft", "containerSizes": "50 lb bag", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['CA', 'OR', 'WA', 'ID', 'MT', 'WY', 'CO', 'NM', 'AZ', 'NV', 'UT'],
  features = ARRAY['OMRI certified organic', 'Slow-release formula', 'Improves soil structure', 'Reduces nutrient leaching', 'Safe for beneficial organisms'],
  specifications = '{"N-P-K Ratio": "10-2-2", "Coverage": "5,000 sq ft per bag", "Application Rate": "20-40 lbs per 1,000 sq ft", "Bag Weight": "50 lbs", "Release Period": "8-12 weeks"}',
  documents = '[{"name": "Product Label", "url": "/docs/fertilizer-label.pdf"}, {"name": "OMRI Certificate", "url": "/docs/omri-cert.pdf"}, {"name": "Application Guide", "url": "/docs/application-guide.pdf"}]'
WHERE id = '2';

UPDATE products SET
  full_description = 'Control tough weeds while protecting your crops with our Advanced Herbicide Solution. This professional-grade formulation provides excellent control of both broadleaf and grassy weeds while remaining safe for use with major crop types when used as directed.',
  sku = 'HERB-AHS-500',
  rating = 4.7,
  review_count = 214,
  attributes = '{"activeIngredients": "Glyphosate 41%", "epaSignalWord": "CAUTION", "epaRegistrationNumber": "524-549", "applicationRateRange": "22-32 fl oz per acre", "containerSizes": "2.5 gallon jug, 30 gallon drum", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['TX', 'OK', 'KS', 'NE', 'SD', 'ND', 'MT', 'WY', 'CO', 'NM', 'AR', 'LA', 'MS', 'AL', 'GA', 'FL', 'SC', 'NC', 'VA', 'TN', 'KY', 'MO', 'IA', 'IL', 'IN', 'OH', 'MI', 'WI', 'MN'],
  features = ARRAY['Broad-spectrum weed control', 'Pre and post-emergent action', 'Rainfast in 1 hour', 'Low crop phytotoxicity', 'Extended residual control'],
  specifications = '{"Active Ingredient": "Glyphosate 41%", "Container Size": "2.5 gallons", "Coverage": "Up to 25 acres", "Application Rate": "22-32 fl oz per acre", "Re-entry Interval": "4 hours"}',
  documents = '[{"name": "Product Label", "url": "/docs/herbicide-label.pdf"}, {"name": "Safety Data Sheet", "url": "/docs/herbicide-sds.pdf"}, {"name": "Technical Data Sheet", "url": "/docs/herbicide-tds.pdf"}, {"name": "Application Instructions", "url": "/docs/herbicide-application.pdf"}]'
WHERE id = '3';

UPDATE products SET
  full_description = 'Maximize water efficiency and crop yields with our Precision Soil Moisture Sensor system. This advanced monitoring solution provides real-time data on soil moisture levels at multiple depths, helping you make informed irrigation decisions and prevent both over and under-watering. The system connects wirelessly to your smartphone or computer for convenient monitoring from anywhere.',
  sku = 'EQUIP-SMS-200',
  rating = 4.9,
  review_count = 156,
  attributes = '{"activeIngredients": "N/A - Electronic Equipment", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "N/A", "containerSizes": "Single Unit, 3-Pack, 5-Pack", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'],
  features = ARRAY['Real-time wireless monitoring', 'Multi-depth soil readings', 'Mobile app integration', 'Low battery alerts', 'Weather-resistant design'],
  specifications = '{"Connectivity": "WiFi & Bluetooth", "Battery Life": "12 months", "Depth Range": "6-36 inches", "Range": "Up to 500 feet", "Warranty": "3 years"}',
  documents = '[{"name": "User Manual", "url": "/docs/sensor-manual.pdf"}, {"name": "Installation Guide", "url": "/docs/sensor-install.pdf"}, {"name": "Technical Specifications", "url": "/docs/sensor-specs.pdf"}]'
WHERE id = '4';

UPDATE products SET
  full_description = 'Our Elite Variety Soybean Seed delivers exceptional performance for commercial soybean production. Bred for high protein content and impressive yield potential, this variety thrives in diverse growing conditions. With excellent disease resistance and standability, these seeds provide reliable performance season after season.',
  sku = 'SOY-EV-3000',
  rating = 4.7,
  review_count = 98,
  attributes = '{"activeIngredients": "N/A - Natural Seed", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "140,000-180,000 seeds per acre", "containerSizes": "50 lb bag, Unit bag (140,000 seeds)", "availabilityDate": "March 2025"}',
  approved_states = ARRAY['IA', 'IL', 'IN', 'OH', 'MN', 'NE', 'SD', 'ND', 'MO', 'KS', 'WI', 'MI', 'KY', 'TN', 'AR'],
  features = ARRAY['High protein content (38%+)', 'Excellent yield potential (60+ bu/acre)', 'Superior disease package', 'Strong emergence vigor', 'Excellent standability'],
  specifications = '{"Maturity Group": "3.0", "Plant Height": "36-42 inches", "Protein Content": "38-40%", "Oil Content": "19-20%", "Recommended Population": "140,000-180,000 plants/acre"}',
  documents = '[{"name": "Product Label", "url": "/docs/soybean-label.pdf"}, {"name": "Agronomic Guide", "url": "/docs/soybean-guide.pdf"}, {"name": "Performance Data", "url": "/docs/soybean-performance.pdf"}]'
WHERE id = '5';

UPDATE products SET
  full_description = 'Our Complete NPK Fertilizer Blend provides balanced nutrition for all your crops. This professional-grade formulation delivers nitrogen for growth, phosphorus for root development, and potassium for overall plant health. The slow-release formula ensures consistent nutrient availability throughout the growing season.',
  sku = 'FERT-NPK-1515',
  rating = 4.5,
  review_count = 142,
  attributes = '{"activeIngredients": "N-P-K 15-15-15", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "300-500 lbs per acre", "containerSizes": "50 lb bag, 1 ton tote", "availabilityDate": "February 2025"}',
  approved_states = ARRAY['AL', 'AR', 'AZ', 'CA', 'CO', 'FL', 'GA', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NM', 'NV', 'OH', 'OK', 'OR', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WA', 'WI', 'WY'],
  features = ARRAY['Balanced 15-15-15 formula', 'Slow-release technology', 'Improves soil fertility', 'Suitable for all crops', 'Easy to apply'],
  specifications = '{"N-P-K Ratio": "15-15-15", "Coverage": "10,000 sq ft per bag", "Application Rate": "300-500 lbs per acre", "Bag Weight": "50 lbs", "Release Period": "10-14 weeks"}',
  documents = '[{"name": "Product Label", "url": "/docs/npk-label.pdf"}, {"name": "Application Guide", "url": "/docs/npk-application.pdf"}, {"name": "Safety Data Sheet", "url": "/docs/npk-sds.pdf"}]'
WHERE id = '6';

UPDATE products SET
  full_description = 'Protect your crops naturally with our Biological Insect Control solution. This eco-friendly product uses beneficial microorganisms to control harmful insect populations without the use of harsh chemicals. Safe for beneficial insects, wildlife, and the environment, it''s the perfect choice for sustainable farming practices.',
  sku = 'BIO-INS-100',
  rating = 4.6,
  review_count = 87,
  attributes = '{"activeIngredients": "Bacillus thuringiensis 10%", "epaSignalWord": "CAUTION", "epaRegistrationNumber": "73049-39", "applicationRateRange": "1-2 lbs per acre", "containerSizes": "5 lb container, 25 lb bag", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AZ', 'AR', 'CA', 'CO', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NM', 'NC', 'ND', 'OH', 'OK', 'OR', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WA', 'WI', 'WY'],
  features = ARRAY['OMRI certified organic', 'Safe for beneficial insects', 'No chemical residues', 'Rainfast in 2 hours', 'Effective on lepidopteran larvae'],
  specifications = '{"Active Ingredient": "Bacillus thuringiensis 10%", "Container Size": "5 lbs", "Coverage": "Up to 5 acres", "Application Rate": "1-2 lbs per acre", "Re-entry Interval": "Immediate"}',
  documents = '[{"name": "Product Label", "url": "/docs/bio-label.pdf"}, {"name": "OMRI Certificate", "url": "/docs/bio-omri.pdf"}, {"name": "Application Guide", "url": "/docs/bio-application.pdf"}]'
WHERE id = '7';

UPDATE products SET
  full_description = 'Transform your irrigation efficiency with our comprehensive Drip Irrigation Starter Kit. This complete system delivers water directly to plant roots, reducing waste and promoting healthier crops. Perfect for row crops, orchards, and specialty crops, this kit includes everything you need to get started with precision irrigation.',
  sku = 'IRR-DRIP-500',
  rating = 4.8,
  review_count = 203,
  attributes = '{"activeIngredients": "N/A - Irrigation Equipment", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "Adjustable flow rate", "containerSizes": "500 ft kit, 1000 ft kit", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'],
  features = ARRAY['Complete installation kit', 'Reduces water usage by 50%', 'Adjustable emitter spacing', 'UV-resistant materials', 'Easy to expand'],
  specifications = '{"Coverage": "Up to 1 acre", "Tubing Length": "500 feet", "Emitter Spacing": "12 inches", "Flow Rate": "0.5 GPH per emitter", "Warranty": "5 years"}',
  documents = '[{"name": "Installation Manual", "url": "/docs/drip-install.pdf"}, {"name": "Design Guide", "url": "/docs/drip-design.pdf"}, {"name": "Maintenance Guide", "url": "/docs/drip-maintenance.pdf"}]'
WHERE id = '8';

UPDATE products SET
  full_description = 'Our Winter Wheat Seed variety is specifically bred for harsh winter conditions and consistent performance. With superior cold tolerance and snow mold resistance, this variety provides reliable yields even in challenging environments. Excellent milling quality and strong straw make it ideal for both grain production and straw sales.',
  sku = 'WHEAT-WIN-2500',
  rating = 4.7,
  review_count = 134,
  attributes = '{"activeIngredients": "N/A - Natural Seed", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "90-120 lbs per acre", "containerSizes": "50 lb bag", "availabilityDate": "August 2024"}',
  approved_states = ARRAY['CO', 'ID', 'IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MT', 'NE', 'ND', 'OH', 'OK', 'OR', 'PA', 'SD', 'WA', 'WI', 'WY'],
  features = ARRAY['Superior winter hardiness', 'Excellent snow mold tolerance', 'High yield potential (80+ bu/acre)', 'Strong straw for lodging resistance', 'Premium milling quality'],
  specifications = '{"Maturity": "Mid-season", "Plant Height": "32-36 inches", "Test Weight": "60-62 lbs/bushel", "Protein Content": "11-13%", "Recommended Seeding Rate": "90-120 lbs/acre"}',
  documents = '[{"name": "Product Label", "url": "/docs/wheat-label.pdf"}, {"name": "Agronomic Guide", "url": "/docs/wheat-guide.pdf"}, {"name": "Performance Data", "url": "/docs/wheat-performance.pdf"}]'
WHERE id = '9';

UPDATE products SET
  full_description = 'Ensure your crops have access to all essential nutrients with our Micronutrient Supplement. This carefully balanced blend provides zinc, manganese, boron, copper, and other critical micronutrients that are often deficient in agricultural soils. Regular application helps prevent deficiency symptoms and maximizes crop quality and yield.',
  sku = 'FERT-MICRO-250',
  rating = 4.6,
  review_count = 76,
  attributes = '{"activeIngredients": "Zinc 5%, Manganese 3%, Boron 1%, Copper 1%", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "5-10 lbs per acre", "containerSizes": "25 lb bag, 50 lb bag", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AR', 'AZ', 'CA', 'CO', 'FL', 'GA', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NM', 'NV', 'OH', 'OK', 'OR', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WA', 'WI', 'WY'],
  features = ARRAY['Complete micronutrient blend', 'Chelated for better absorption', 'Prevents deficiency symptoms', 'Compatible with liquid fertilizers', 'Suitable for foliar or soil application'],
  specifications = '{"Zinc (Zn)": "5%", "Manganese (Mn)": "3%", "Boron (B)": "1%", "Copper (Cu)": "1%", "Application Rate": "5-10 lbs per acre"}',
  documents = '[{"name": "Product Label", "url": "/docs/micro-label.pdf"}, {"name": "Application Guide", "url": "/docs/micro-application.pdf"}, {"name": "Deficiency Guide", "url": "/docs/micro-deficiency.pdf"}]'
WHERE id = '10';

UPDATE products SET
  full_description = 'Protect your investment with Fungicide Treatment Pro, a powerful solution for controlling a broad spectrum of fungal diseases. This professional-grade formulation provides both preventative and curative action against common crop diseases including rust, blight, and powdery mildew. The systemic action moves through the plant to provide long-lasting protection.',
  sku = 'FUNG-PRO-750',
  rating = 4.8,
  review_count = 167,
  attributes = '{"activeIngredients": "Propiconazole 14.3%", "epaSignalWord": "WARNING", "epaRegistrationNumber": "432-1363", "applicationRateRange": "4-8 fl oz per acre", "containerSizes": "2.5 gallon jug", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AR', 'AZ', 'CA', 'CO', 'FL', 'GA', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NM', 'OH', 'OK', 'OR', 'SC', 'SD', 'TN', 'TX', 'VA', 'WA', 'WI', 'WY'],
  features = ARRAY['Broad-spectrum disease control', 'Systemic and protective action', 'Long residual activity', 'Rainfast in 1 hour', 'Tank mix compatible'],
  specifications = '{"Active Ingredient": "Propiconazole 14.3%", "Container Size": "2.5 gallons", "Coverage": "Up to 80 acres", "Application Rate": "4-8 fl oz per acre", "Re-entry Interval": "24 hours"}',
  documents = '[{"name": "Product Label", "url": "/docs/fungicide-label.pdf"}, {"name": "Safety Data Sheet", "url": "/docs/fungicide-sds.pdf"}, {"name": "Disease Guide", "url": "/docs/fungicide-diseases.pdf"}, {"name": "Application Instructions", "url": "/docs/fungicide-application.pdf"}]'
WHERE id = '11';

UPDATE products SET
  full_description = 'Make informed decisions with real-time weather data from our Smart Weather Station. This professional-grade system monitors temperature, humidity, rainfall, wind speed, wind direction, and barometric pressure. Connect to your smartphone or computer to access current conditions, historical data, and receive alerts for critical weather events. Perfect for optimizing spray applications, irrigation scheduling, and protecting crops from weather-related damage.',
  sku = 'EQUIP-WX-1000',
  rating = 4.9,
  review_count = 189,
  attributes = '{"activeIngredients": "N/A - Electronic Equipment", "epaSignalWord": "Not Applicable", "epaRegistrationNumber": "Not Applicable", "applicationRateRange": "N/A", "containerSizes": "Single Unit", "availabilityDate": "Year-round"}',
  approved_states = ARRAY['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'],
  features = ARRAY['Comprehensive weather monitoring', 'Wireless data transmission', 'Mobile app & web portal', 'Customizable weather alerts', 'Solar powered with battery backup'],
  specifications = '{"Sensors": "Temperature, Humidity, Rain, Wind, Pressure", "Connectivity": "WiFi & Cellular", "Data Logging": "Unlimited cloud storage", "Range": "Up to 1000 feet", "Warranty": "5 years"}',
  documents = '[{"name": "User Manual", "url": "/docs/weather-manual.pdf"}, {"name": "Installation Guide", "url": "/docs/weather-install.pdf"}, {"name": "Quick Start Guide", "url": "/docs/weather-quickstart.pdf"}, {"name": "Technical Specifications", "url": "/docs/weather-specs.pdf"}]'
WHERE id = '12';
