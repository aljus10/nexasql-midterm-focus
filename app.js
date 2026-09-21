import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const DB_VERSION = 'nexasql-midterm-v5';
const PROGRESS_KEY = 'nexasql_midterm_focus_progress_v4';

const PATTERNS = {
  kpi: {
    id: 'kpi', number: 1, title: 'Totals & KPIs', short: 'Sales, orders, units, customers',
    description: 'Answer “How much?” and “How many?” questions without unnecessary joins.',
    memory: 'Metric first: sales = SUM(net_sales), orders = COUNT(DISTINCT order_number), units = SUM(quantity).',
    example: `SELECT\n  ROUND(SUM(net_sales), 2) AS total_sales\nFROM fact_order_items;`,
    steps: [
      ['Identify the metric', 'Sales? Orders? Units? Customers?'],
      ['Start from the fact table', 'Most KPI questions need only fact_order_items.'],
      ['Aggregate', 'Use SUM, COUNT, or COUNT(DISTINCT ...).'],
      ['Add a filter only if asked', 'For example, WHERE EXTRACT(YEAR FROM order_date) = 2026.']
    ]
  },
  topn: {
    id: 'topn', number: 2, title: 'Top-N Rankings', short: 'Top products, categories, brands',
    description: 'Rank groups from highest to lowest and keep only the requested number.',
    memory: 'Top-N = JOIN + GROUP BY + ORDER BY metric DESC + LIMIT N.',
    example: `SELECT\n  p.product_name,\n  ROUND(SUM(f.net_sales), 2) AS sales\nFROM fact_order_items f\nJOIN dim_product p ON f.product_id = p.product_id\nGROUP BY p.product_id, p.product_name\nORDER BY sales DESC\nLIMIT 10;`,
    steps: [
      ['Choose the dimension', 'Products → dim_product, sellers → dim_seller, customers → dim_customer.'],
      ['Choose the ranking metric', 'Usually net sales, units sold, or number of orders.'],
      ['Group', 'One result row per product/category/customer/etc.'],
      ['Rank and limit', 'ORDER BY ... DESC, then LIMIT 10 or LIMIT 5.']
    ]
  },
  place: {
    id: 'place', number: 3, title: 'Category & Place', short: 'Category in Cebu, sales by city',
    description: 'Combine product and customer dimensions to answer location-based business questions.',
    memory: 'Place is usually a WHERE condition from dim_customer; category comes from dim_product.',
    example: `SELECT\n  p.category,\n  ROUND(SUM(f.net_sales), 2) AS sales\nFROM fact_order_items f\nJOIN dim_product p ON f.product_id = p.product_id\nJOIN dim_customer c ON f.customer_id = c.customer_id\nWHERE c.city = 'Cebu City'\nGROUP BY p.category\nORDER BY sales DESC\nLIMIT 1;`,
    steps: [
      ['Find every dimension in the sentence', '“Category” → product. “Cebu City” → customer.'],
      ['Join both dimensions', 'The fact table connects them.'],
      ['Filter the place', 'Use WHERE c.city = ...'],
      ['Group and rank', 'Group by category, then sort by the requested metric.']
    ]
  },
  trend: {
    id: 'trend', number: 4, title: 'Time Trends', short: 'Monthly sales, yearly totals',
    description: 'Analyze how business performance changes over time.',
    memory: 'Trend = group by time and ORDER BY time, not by sales.',
    example: `SELECT\n  DATE_TRUNC('month', order_date)::DATE AS month,\n  ROUND(SUM(net_sales), 2) AS sales\nFROM fact_order_items\nWHERE EXTRACT(YEAR FROM order_date) = 2026\nGROUP BY DATE_TRUNC('month', order_date)\nORDER BY month;`,
    steps: [
      ['Choose the time grain', 'Month? Year? Specific month across years?'],
      ['Choose the metric', 'Sales, orders, units, or discounts.'],
      ['Filter the time range', 'Use EXTRACT(YEAR...) when needed.'],
      ['Sort chronologically', 'ORDER BY month/year, not DESC by sales.']
    ]
  },
  people: {
    id: 'people', number: 5, title: 'Customers & Sellers', short: 'Best customers and shops',
    description: 'Measure who buys most and which sellers perform best.',
    memory: 'Customer spending uses SUM(total_paid); business revenue usually uses SUM(net_sales).',
    example: `SELECT\n  c.customer_name,\n  ROUND(SUM(f.total_paid), 2) AS total_spent\nFROM fact_order_items f\nJOIN dim_customer c ON f.customer_id = c.customer_id\nGROUP BY c.customer_id, c.customer_name\nORDER BY total_spent DESC\nLIMIT 10;`,
    steps: [
      ['Choose who', 'Customer or seller?'],
      ['Choose the correct metric', 'Customer spending → total_paid; seller revenue → net_sales.'],
      ['Group by the person/shop', 'One row per customer or seller.'],
      ['Rank', 'ORDER BY metric DESC and LIMIT.']
    ]
  },
  mixed: {
    id: 'mixed', number: 6, title: 'Filtered Rankings', short: 'Top products in Manila in 2025',
    description: 'Combine ranking, joins, place filters, and date filters—the most exam-like pattern.',
    memory: 'Break the question into: thing + metric + filters + ranking + limit.',
    example: `SELECT\n  p.product_name,\n  ROUND(SUM(f.net_sales), 2) AS sales\nFROM fact_order_items f\nJOIN dim_product p ON f.product_id = p.product_id\nJOIN dim_customer c ON f.customer_id = c.customer_id\nWHERE c.city = 'Manila'\n  AND EXTRACT(YEAR FROM f.order_date) = 2025\nGROUP BY p.product_id, p.product_name\nORDER BY sales DESC\nLIMIT 10;`,
    steps: [
      ['Underline the nouns', 'Products, customers, sellers, category, payment, shipping.'],
      ['Underline the filters', 'City, year, category, payment method.'],
      ['Choose the metric', 'Sales? Units? Orders? Spending?'],
      ['Assemble the same skeleton', 'JOIN → WHERE → GROUP BY → ORDER BY → LIMIT.']
    ]
  }
};

const QUESTIONS = [
  // KPI
  q('kpi-1','kpi','What is the total sales of NexaCart?','Net sales','None','None','One total','No limit',
    `SELECT ROUND(SUM(net_sales), 2) AS total_sales FROM fact_order_items;`,
    ['You only need fact_order_items.','Use SUM on net_sales.','No JOIN and no GROUP BY are needed.'],
    'Teacher asks "Total sales" ➔ Look for SUM(net_sales) from fact_order_items'),
  q('kpi-2','kpi','How many unique orders did NexaCart receive?','Orders','None','None','One total','No limit',
    `SELECT COUNT(DISTINCT order_number) AS total_orders FROM fact_order_items;`,
    ['A fact row is an order item, not a whole order.','Count distinct order_number.','Use COUNT(DISTINCT order_number).'],
    'Teacher asks "Unique orders" ➔ Look for COUNT(DISTINCT order_number)'),
  q('kpi-3','kpi','How many physical units were sold in total?','Units sold','None','None','One total','No limit',
    `SELECT SUM(quantity) AS units_sold FROM fact_order_items;`,
    ['Use quantity, not COUNT(*).','You want a SUM.','SUM(quantity) gives physical units.'],
    'Teacher asks "Physical units / Quantity" ➔ Look for SUM(quantity)'),
  q('kpi-4','kpi','How many unique customers made a purchase?','Customers','None','None','One total','No limit',
    `SELECT COUNT(DISTINCT customer_id) AS active_customers FROM fact_order_items;`,
    ['Customer ID already exists in the fact table.','Count distinct customers.','COUNT(DISTINCT customer_id).'],
    'Teacher asks "Unique customers" ➔ Look for COUNT(DISTINCT customer_id)'),
  q('kpi-5','kpi','What was the total sales in 2026?','Net sales','None','Year = 2026','One total','No limit',
    `SELECT ROUND(SUM(net_sales), 2) AS sales_2026 FROM fact_order_items WHERE EXTRACT(YEAR FROM order_date) = 2026;`,
    ['Use net_sales.','Filter order_date to 2026.','EXTRACT(YEAR FROM order_date) = 2026.'],
    'Teacher asks "Sales in [Year]" ➔ SUM(net_sales) + WHERE EXTRACT(YEAR FROM order_date) = 2026'),
  q('kpi-6','kpi','What was the total discount amount given?','Discounts','None','None','One total','No limit',
    `SELECT ROUND(SUM(discount_amount), 2) AS total_discounts FROM fact_order_items;`,
    ['The fact table already stores discount_amount.','Use SUM.','SUM(discount_amount).'],
    'Teacher asks "Total discounts" ➔ Look for SUM(discount_amount)'),

  // Top N
  q('topn-1','topn','Show the Top 10 products by sales.','Net sales','Product','None','Highest first','10',
    `SELECT p.product_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id GROUP BY p.product_id,p.product_name ORDER BY sales DESC LIMIT 10;`,
    ['Join dim_product.','Group by product.','ORDER BY SUM(net_sales) DESC and LIMIT 10.'],
    'Teacher asks "Top 10 products" ➔ JOIN dim_product + ORDER BY sales DESC LIMIT 10'),
  q('topn-2','topn','Show the Top 10 products by units sold.','Units sold','Product','None','Highest first','10',
    `SELECT p.product_name, SUM(f.quantity) AS units_sold FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id GROUP BY p.product_id,p.product_name ORDER BY units_sold DESC LIMIT 10;`,
    ['The metric is units, not sales.','Use SUM(quantity).','Group by product and LIMIT 10.'],
    'Teacher asks "Top 10 by units" ➔ SUM(quantity) + ORDER BY units_sold DESC LIMIT 10'),
  q('topn-3','topn','Rank all product categories from highest to lowest sales.','Net sales','Category','None','Highest first','All',
    `SELECT p.category, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id GROUP BY p.category ORDER BY sales DESC;`,
    ['Category lives in dim_product.','Group by p.category.','No LIMIT because the question says all categories.'],
    'Teacher asks "Rank categories" ➔ JOIN dim_product + GROUP BY p.category + ORDER BY sales DESC'),
  q('topn-4','topn','Show the Top 5 brands by sales.','Net sales','Brand','None','Highest first','5',
    `SELECT p.brand, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id GROUP BY p.brand ORDER BY sales DESC LIMIT 5;`,
    ['Brand lives in dim_product.','Group by brand.','Sort sales descending and LIMIT 5.'],
    'Teacher asks "Top 5 brands" ➔ JOIN dim_product + GROUP BY p.brand + LIMIT 5'),
  q('topn-5','topn','Show the Top 5 customer cities by sales.','Net sales','Customer city','None','Highest first','5',
    `SELECT c.city, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_customer c ON f.customer_id=c.customer_id GROUP BY c.city ORDER BY sales DESC LIMIT 5;`,
    ['City comes from dim_customer.','Group by city.','ORDER BY sales DESC LIMIT 5.'],
    'Teacher asks "Top 5 cities" ➔ JOIN dim_customer + GROUP BY c.city + LIMIT 5'),
  q('topn-6','topn','Show the Top 5 sellers by sales.','Net sales','Seller','None','Highest first','5',
    `SELECT s.shop_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_seller s ON f.seller_id=s.seller_id GROUP BY s.seller_id,s.shop_name ORDER BY sales DESC LIMIT 5;`,
    ['Join dim_seller.','Group by seller.','Rank SUM(net_sales) descending.'],
    'Teacher asks "Top 5 sellers" ➔ JOIN dim_seller + GROUP BY s.shop_name + LIMIT 5'),

  // Place/category
  q('place-1','place','What is the #1 product category by sales in Cebu City?','Net sales','Category + Customer city','Cebu City','Highest first','1',
    `SELECT p.category, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Cebu City' GROUP BY p.category ORDER BY sales DESC LIMIT 1;`,
    ['You need product and customer dimensions.','Filter c.city to Cebu City.','Group by category, rank by sales, LIMIT 1.'],
    'Teacher asks "Category in Cebu City" ➔ WHERE c.city = \'Cebu City\' + LIMIT 1'),
  q('place-2','place','Show sales by category for customers in Manila.','Net sales','Category + Customer city','Manila','Highest first','All',
    `SELECT p.category, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Manila' GROUP BY p.category ORDER BY sales DESC;`,
    ['Join product and customer.','WHERE c.city = Manila.','Group by category.'],
    'Teacher asks "Category for Manila" ➔ WHERE c.city = \'Manila\' + GROUP BY p.category'),
  q('place-3','place','Show the Top 5 products by sales in Baguio.','Net sales','Product + Customer city','Baguio','Highest first','5',
    `SELECT p.product_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Baguio' GROUP BY p.product_id,p.product_name ORDER BY sales DESC LIMIT 5;`,
    ['Two joins: product + customer.','Filter Baguio.','Group product, sort sales DESC, LIMIT 5.'],
    'Teacher asks "Top 5 in Baguio" ➔ WHERE c.city = \'Baguio\' + LIMIT 5'),
  q('place-4','place','Which customer city generated the highest sales?','Net sales','Customer city','None','Highest first','1',
    `SELECT c.city, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_customer c ON f.customer_id=c.customer_id GROUP BY c.city ORDER BY sales DESC LIMIT 1;`,
    ['Only dim_customer is needed.','Group by city.','Highest first, LIMIT 1.'],
    'Teacher asks "#1 city by sales" ➔ JOIN dim_customer + ORDER BY sales DESC LIMIT 1'),
  q('place-5','place','Show units sold by category in Davao City.','Units sold','Category + Customer city','Davao City','Highest first','All',
    `SELECT p.category, SUM(f.quantity) AS units_sold FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Davao City' GROUP BY p.category ORDER BY units_sold DESC;`,
    ['Metric is units → SUM(quantity).','Filter customer city.','Group by product category.'],
    'Teacher asks "Units by category in Davao" ➔ SUM(quantity) + WHERE c.city = \'Davao City\''),
  q('place-6','place','Show sales by customer city from highest to lowest.','Net sales','Customer city','None','Highest first','All',
    `SELECT c.city, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_customer c ON f.customer_id=c.customer_id GROUP BY c.city ORDER BY sales DESC;`,
    ['Join dim_customer.','No city filter because you want every city.','Group by city and sort sales descending.'],
    'Teacher asks "Sales by city highest to lowest" ➔ GROUP BY c.city + ORDER BY sales DESC'),

  // Trend
  q('trend-1','trend','Show the monthly sales trend for 2026.','Net sales','Month','Year = 2026','Chronological','All months',
    `SELECT DATE_TRUNC('month',order_date)::DATE AS month, ROUND(SUM(net_sales),2) AS sales FROM fact_order_items WHERE EXTRACT(YEAR FROM order_date)=2026 GROUP BY DATE_TRUNC('month',order_date) ORDER BY month;`,
    ['Use DATE_TRUNC month.','Filter to 2026.','ORDER BY month, not by sales.'],
    'Teacher asks "Monthly trend" ➔ DATE_TRUNC(\'month\', order_date) + ORDER BY month'),
  q('trend-2','trend','Show monthly order counts for 2025.','Orders','Month','Year = 2025','Chronological','All months',
    `SELECT DATE_TRUNC('month',order_date)::DATE AS month, COUNT(DISTINCT order_number) AS orders FROM fact_order_items WHERE EXTRACT(YEAR FROM order_date)=2025 GROUP BY DATE_TRUNC('month',order_date) ORDER BY month;`,
    ['Orders = COUNT(DISTINCT order_number).','Group by month.','Filter to 2025 and sort chronologically.'],
    'Teacher asks "Monthly orders" ➔ COUNT(DISTINCT order_number) + GROUP BY month'),
  q('trend-3','trend','Show yearly sales from 2024 to 2026.','Net sales','Year','2024–2026','Chronological','All years',
    `SELECT EXTRACT(YEAR FROM order_date)::INT AS year, ROUND(SUM(net_sales),2) AS sales FROM fact_order_items GROUP BY EXTRACT(YEAR FROM order_date) ORDER BY year;`,
    ['Group by extracted year.','No join is needed.','ORDER BY year.'],
    'Teacher asks "Yearly sales" ➔ EXTRACT(YEAR FROM order_date) + ORDER BY year'),
  q('trend-4','trend','Show monthly units sold in 2026.','Units sold','Month','Year = 2026','Chronological','All months',
    `SELECT DATE_TRUNC('month',order_date)::DATE AS month, SUM(quantity) AS units_sold FROM fact_order_items WHERE EXTRACT(YEAR FROM order_date)=2026 GROUP BY DATE_TRUNC('month',order_date) ORDER BY month;`,
    ['Units = SUM(quantity).','Group by month.','Filter to 2026.'],
    'Teacher asks "Monthly units" ➔ SUM(quantity) + DATE_TRUNC(\'month\', order_date)'),
  q('trend-5','trend','Show total sales for August in each year.','Net sales','Year','Month = August','Chronological','All years',
    `SELECT EXTRACT(YEAR FROM order_date)::INT AS year, ROUND(SUM(net_sales),2) AS august_sales FROM fact_order_items WHERE EXTRACT(MONTH FROM order_date)=8 GROUP BY EXTRACT(YEAR FROM order_date) ORDER BY year;`,
    ['Filter month number 8.','Group by year.','Sort by year.'],
    'Teacher asks "August sales across years" ➔ WHERE EXTRACT(MONTH FROM order_date) = 8'),
  q('trend-6','trend','Show monthly discount amounts in 2025.','Discounts','Month','Year = 2025','Chronological','All months',
    `SELECT DATE_TRUNC('month',order_date)::DATE AS month, ROUND(SUM(discount_amount),2) AS discounts FROM fact_order_items WHERE EXTRACT(YEAR FROM order_date)=2025 GROUP BY DATE_TRUNC('month',order_date) ORDER BY month;`,
    ['Use SUM(discount_amount).','Filter 2025.','Group and sort by month.'],
    'Teacher asks "Monthly discounts" ➔ SUM(discount_amount) + DATE_TRUNC(\'month\', order_date)'),

  // People/sellers/payment
  q('people-1','people','Show the Top 10 customers by total amount spent.','Customer spending','Customer','None','Highest first','10',
    `SELECT c.customer_name, ROUND(SUM(f.total_paid),2) AS total_spent FROM fact_order_items f JOIN dim_customer c ON f.customer_id=c.customer_id GROUP BY c.customer_id,c.customer_name ORDER BY total_spent DESC LIMIT 10;`,
    ['Customer spending uses total_paid.','Join dim_customer.','Group customer, ORDER BY total_spent DESC.'],
    'Teacher asks "Customer spent" ➔ SUM(f.total_paid) + JOIN dim_customer + LIMIT 10'),
  q('people-2','people','Show the Top 5 customers by number of orders.','Orders','Customer','None','Highest first','5',
    `SELECT c.customer_name, COUNT(DISTINCT f.order_number) AS orders FROM fact_order_items f JOIN dim_customer c ON f.customer_id=c.customer_id GROUP BY c.customer_id,c.customer_name ORDER BY orders DESC LIMIT 5;`,
    ['Count distinct order_number.','Join dim_customer.','Group customer and LIMIT 5.'],
    'Teacher asks "Top customers by orders" ➔ COUNT(DISTINCT f.order_number) + LIMIT 5'),
  q('people-3','people','Which seller generated the highest sales?','Net sales','Seller','None','Highest first','1',
    `SELECT s.shop_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_seller s ON f.seller_id=s.seller_id GROUP BY s.seller_id,s.shop_name ORDER BY sales DESC LIMIT 1;`,
    ['Join dim_seller.','Group seller.','Highest sales → DESC + LIMIT 1.'],
    'Teacher asks "#1 seller by sales" ➔ JOIN dim_seller + ORDER BY sales DESC LIMIT 1'),
  q('people-4','people','Which payment method was used by the most unique orders?','Orders','Payment method','None','Highest first','1',
    `SELECT p.payment_method, COUNT(DISTINCT f.order_number) AS orders FROM fact_order_items f JOIN dim_payment p ON f.payment_id=p.payment_id GROUP BY p.payment_id,p.payment_method ORDER BY orders DESC LIMIT 1;`,
    ['Join dim_payment.','Count distinct orders, not fact rows.','Sort descending and LIMIT 1.'],
    'Teacher asks "#1 payment method" ➔ JOIN dim_payment + COUNT(DISTINCT order_number) + LIMIT 1'),
  q('people-5','people','Rank shipping couriers by number of unique orders.','Orders','Courier','None','Highest first','All',
    `SELECT sh.courier_name, COUNT(DISTINCT f.order_number) AS orders FROM fact_order_items f JOIN dim_shipping sh ON f.shipping_id=sh.shipping_id GROUP BY sh.courier_name ORDER BY orders DESC;`,
    ['Courier is in dim_shipping.','Count distinct order_number.','Group by courier name.'],
    'Teacher asks "Rank couriers" ➔ JOIN dim_shipping + COUNT(DISTINCT order_number)'),
  q('people-6','people','Show sales by seller from highest to lowest.','Net sales','Seller','None','Highest first','All',
    `SELECT s.shop_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_seller s ON f.seller_id=s.seller_id GROUP BY s.seller_id,s.shop_name ORDER BY sales DESC;`,
    ['Join dim_seller.','Group by seller.','ORDER BY sales DESC.'],
    'Teacher asks "Sales by seller" ➔ JOIN dim_seller + GROUP BY s.shop_name + ORDER BY sales DESC'),

  // Mixed
  q('mixed-1','mixed','Show the Top 10 products by sales in Manila during 2025.','Net sales','Product + Customer city','Manila + 2025','Highest first','10',
    `SELECT p.product_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Manila' AND EXTRACT(YEAR FROM f.order_date)=2025 GROUP BY p.product_id,p.product_name ORDER BY sales DESC LIMIT 10;`,
    ['Product + customer means two joins.','Use both city and year in WHERE.','Group product, sort sales DESC, LIMIT 10.'],
    'Teacher asks "Top 10 in Manila in 2025" ➔ WHERE c.city = \'Manila\' AND YEAR = 2025 + LIMIT 10'),
  q('mixed-2','mixed','What was the #1 category by sales in Cebu City during 2026?','Net sales','Category + Customer city','Cebu City + 2026','Highest first','1',
    `SELECT p.category, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Cebu City' AND EXTRACT(YEAR FROM f.order_date)=2026 GROUP BY p.category ORDER BY sales DESC LIMIT 1;`,
    ['Join product and customer.','Filter Cebu City and 2026.','Group category, DESC, LIMIT 1.'],
    'Teacher asks "#1 category in Cebu 2026" ➔ WHERE c.city = \'Cebu City\' AND YEAR = 2026 + LIMIT 1'),
  q('mixed-3','mixed','Show the Top 5 Electronics products by units sold in 2026.','Units sold','Product + Category','Electronics + 2026','Highest first','5',
    `SELECT p.product_name, SUM(f.quantity) AS units_sold FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id WHERE p.category='Electronics' AND EXTRACT(YEAR FROM f.order_date)=2026 GROUP BY p.product_id,p.product_name ORDER BY units_sold DESC LIMIT 5;`,
    ['Metric is units → SUM(quantity).','Category filter is in dim_product.','Filter year too, then rank and LIMIT 5.'],
    'Teacher asks "Top 5 Electronics by units" ➔ SUM(quantity) + WHERE category = \'Electronics\' + LIMIT 5'),
  q('mixed-4','mixed','Show the Top 5 products by sales in Quezon City during 2024.','Net sales','Product + Customer city','Quezon City + 2024','Highest first','5',
    `SELECT p.product_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_product p ON f.product_id=p.product_id JOIN dim_customer c ON f.customer_id=c.customer_id WHERE c.city='Quezon City' AND EXTRACT(YEAR FROM f.order_date)=2024 GROUP BY p.product_id,p.product_name ORDER BY sales DESC LIMIT 5;`,
    ['Two dimensions: product and customer.','Two filters: city and year.','Rank sales descending, LIMIT 5.'],
    'Teacher asks "Top 5 in Quezon City 2024" ➔ WHERE c.city = \'Quezon City\' AND YEAR = 2024 + LIMIT 5'),
  q('mixed-5','mixed','Rank payment methods by unique orders in 2026.','Orders','Payment method','Year = 2026','Highest first','All',
    `SELECT p.payment_method, COUNT(DISTINCT f.order_number) AS orders FROM fact_order_items f JOIN dim_payment p ON f.payment_id=p.payment_id WHERE EXTRACT(YEAR FROM f.order_date)=2026 GROUP BY p.payment_id,p.payment_method ORDER BY orders DESC;`,
    ['Payment method → dim_payment.','Orders → COUNT(DISTINCT order_number).','Filter 2026, then group and rank.'],
    'Teacher asks "Payment methods in 2026" ➔ WHERE YEAR = 2026 + COUNT(DISTINCT order_number)'),
  q('mixed-6','mixed','Show the Top 5 sellers by sales from Fashion products in 2025.','Net sales','Seller + Product category','Fashion + 2025','Highest first','5',
    `SELECT s.shop_name, ROUND(SUM(f.net_sales),2) AS sales FROM fact_order_items f JOIN dim_seller s ON f.seller_id=s.seller_id JOIN dim_product p ON f.product_id=p.product_id WHERE p.category='Fashion' AND EXTRACT(YEAR FROM f.order_date)=2025 GROUP BY s.seller_id,s.shop_name ORDER BY sales DESC LIMIT 5;`,
    ['Need seller and product dimensions.','Filter Fashion and 2025.','Group seller, rank sales, LIMIT 5.'],
    'Teacher asks "Top 5 sellers from Fashion 2025" ➔ WHERE category = \'Fashion\' AND YEAR = 2025 + LIMIT 5')
];

function q(id, pattern, prompt, metric, dimension, filters, sort, limit, sql, hints, teacherClue='') {
  return { id, pattern, prompt, metric, dimension, filters, sort, limit, sql, hints, teacherClue };
}

let db;
let state = loadProgress();
let currentPage = 'home';
let currentLesson = 'kpi';
let currentQuestion = null;
let practiceAttempts = 0;
let practiceHints = 0;
let practiceSolved = false;
let practiceMode = 'weakest';
let practiceStage = 1;
let puzzleState = null;
let toastTimer;
let mock = null;
let mockTimerHandle = null;

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

// --- SUPABASE AUTH & CLOUD SYNC ENGINE ---
const SUPABASE_CONFIG_KEY = 'nexasql_supabase_config_v1';
let supabaseClient = null;
let currentUser = null;
let cloudSyncing = false;

let activeSupabaseConfig = null;

async function fetchServerConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return null;
    const cfg = await res.json();
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      return { url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey };
    }
  } catch {
    // Local dev or non-Vercel environment
  }
  return null;
}

function getSupabaseConfig() {
  if (activeSupabaseConfig && activeSupabaseConfig.url && activeSupabaseConfig.anonKey) {
    return activeSupabaseConfig;
  }
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSupabaseConfig(url, anonKey) {
  activeSupabaseConfig = { url: url.trim(), anonKey: anonKey.trim() };
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(activeSupabaseConfig));
  initSupabase();
}

async function initSupabase() {
  // 1. First attempt to load credentials automatically from Vercel /api/config
  const srvCfg = await fetchServerConfig();
  if (srvCfg) {
    activeSupabaseConfig = srvCfg;
  }

  // 2. Fallback to localStorage
  const config = getSupabaseConfig();
  if (config && config.url && config.anonKey) {
    try {
      supabaseClient = createClient(config.url, config.anonKey);
      await checkCurrentUser();
      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateCloudUI();
        if (event === 'SIGNED_IN') {
          syncFromCloud();
        }
      });
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      supabaseClient = null;
      currentUser = null;
    }
  } else {
    supabaseClient = null;
    currentUser = null;
  }
  updateCloudUI();
}

async function checkCurrentUser() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data?.user || null;
    updateCloudUI();
    if (currentUser) {
      syncFromCloud();
    }
  } catch (err) {
    console.error('Error checking current user:', err);
  }
}

async function syncToCloud(showToast = false) {
  if (!supabaseClient || !currentUser) return;
  cloudSyncing = true;
  updateCloudUI();
  try {
    // Try nexasql_progress first (coexists cleanly with mips_progress in same project)
    let res = await supabaseClient
      .from('nexasql_progress')
      .upsert({
        user_id: currentUser.id,
        progress: state,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (res.error && (res.error.message?.includes('does not exist') || res.error.code === '42P01')) {
      // Fallback if user created user_progress table instead
      res = await supabaseClient
        .from('user_progress')
        .upsert({
          user_id: currentUser.id,
          email: currentUser.email,
          progress: state,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    }

    if (res.error) {
      console.warn('Cloud sync issue:', res.error);
      if (showToast) toast(`Cloud sync: ${res.error.message}`);
    } else {
      if (showToast) toast('Progress synced to Supabase Cloud! ☁️');
    }
  } catch (err) {
    console.error('Cloud sync error:', err);
  } finally {
    cloudSyncing = false;
    updateCloudUI();
  }
}

async function syncFromCloud() {
  if (!supabaseClient || !currentUser) return;
  cloudSyncing = true;
  updateCloudUI();
  try {
    // Try nexasql_progress first
    let { data, error } = await supabaseClient
      .from('nexasql_progress')
      .select('progress, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
      // Fallback to user_progress
      const fallback = await supabaseClient
        .from('user_progress')
        .select('progress, updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Error fetching cloud progress:', error);
    } else if (data && (data.progress || data.data)) {
      const cloudState = data.progress || data.data;
      if ((cloudState.xp || 0) >= (state.xp || 0)) {
        state = {
          ...defaultProgress(),
          ...cloudState,
          patternScores: { ...defaultProgress().patternScores, ...cloudState.patternScores },
          ladder: normalizeLadder(cloudState.ladder)
        };
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
        renderAll();
        toast('Synced latest progress from Supabase Cloud! ☁️');
      } else {
        syncToCloud();
      }
    } else {
      syncToCloud();
    }
  } catch (err) {
    console.error('Error fetching cloud progress:', err);
  } finally {
    cloudSyncing = false;
    updateCloudUI();
  }
}

async function handleSignOut() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut();
    currentUser = null;
    updateCloudUI();
    showAuthGate();
    toast('Logged out of Supabase Cloud.');
  } catch (e) {
    toast(`Sign out error: ${e.message}`);
  }
}

function showAuthGate() {
  const gate = $('#authGate');
  const app = $('#app');
  if (gate) gate.classList.remove('hidden');
  if (app) app.classList.add('hidden');
  const pass = $('#gateLoginPassword');
  if (pass) pass.value = '';
  const err = $('#gateAuthError');
  if (err) { err.textContent = ''; err.classList.remove('show'); }
}

function showApp(user) {
  const gate = $('#authGate');
  const app = $('#app');
  if (gate) gate.classList.add('hidden');
  if (app) app.classList.remove('hidden');
  updateCloudUI();
}

let gateMode = 'login'; // 'login' or 'signup'

function bindAuthGate() {
  const form = $('#gateLoginForm');
  const toggleBtn = $('#gateToggleModeBtn');
  const guestBtn = $('#gateGuestBtn');
  const title = $('#authGateTitle');
  const sub = $('#authGateSub');
  const btn = $('#gateLoginBtn');
  const err = $('#gateAuthError');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      gateMode = gateMode === 'login' ? 'signup' : 'login';
      if (gateMode === 'signup') {
        if (title) title.textContent = 'Create NexaSQL Account';
        if (sub) sub.textContent = 'Create your account with email and password to sync your progress automatically across devices.';
        if (btn) btn.textContent = 'Sign up';
        toggleBtn.textContent = 'Already have an account? Sign in';
      } else {
        if (title) title.textContent = 'Sign in to NexaSQL';
        if (sub) sub.textContent = 'Your progress syncs through Supabase Cloud, so your XP, streaks, and unlocked stages follow you from laptop to phone.';
        if (btn) btn.textContent = 'Sign in';
        toggleBtn.textContent = 'Need an account? Sign up';
      }
      if (err) { err.textContent = ''; err.classList.remove('show'); }
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      showApp(null);
      toast('Continuing in offline / guest mode.');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) { err.textContent = ''; err.classList.remove('show'); }
      const email = $('#gateLoginEmail')?.value?.trim();
      const password = $('#gateLoginPassword')?.value;

      if (!supabaseClient) {
        if (err) {
          err.textContent = 'Supabase is connecting or not configured yet. Please check your Vercel Environment Variables.';
          err.classList.add('show');
        }
        return;
      }

      btn.disabled = true;
      const prevText = btn.textContent;
      btn.textContent = gateMode === 'login' ? 'Signing in…' : 'Creating account…';

      try {
        if (gateMode === 'login') {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error || !data?.user) {
            let msg = error?.message || 'Could not sign in.';
            if (msg.includes('Failed to fetch')) {
              msg = 'Failed to fetch: Please verify your Supabase project is active and URL is reachable.';
            }
            if (err) { err.textContent = msg; err.classList.add('show'); }
            return;
          }
          currentUser = data.user;
          showApp(currentUser);
          await syncFromCloud();
          toast(`Welcome back, ${currentUser.email}! ☁️`);
        } else {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error || !data?.user) {
            if (err) { err.textContent = error?.message || 'Could not sign up.'; err.classList.add('show'); }
            return;
          }
          currentUser = data.user;
          showApp(currentUser);
          await syncToCloud(true);
          toast('Account created! Welcome to NexaSQL 🚀');
        }
      } catch (ex) {
        if (err) { err.textContent = ex.message || 'Authentication error'; err.classList.add('show'); }
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  }
}

function updateCloudUI() {
  const container = $('#sideCloudCard');
  if (!container) return;

  const config = getSupabaseConfig();
  if (!config || !config.url || !config.anonKey) {
    container.innerHTML = `
      <div class="side-cloud-header">
        <span>Cloud Sync</span>
        <span class="cloud-status-badge">Not configured</span>
      </div>
      <button class="side-cloud-btn primary" id="connectSupabaseBtn">
        <span>⚙️ Connect Supabase</span>
      </button>
      <small style="color:#6f80a6; font-size:10px; line-height:1.3">Connect your Supabase project to enable email & password cloud saving.</small>
    `;
    const btn = $('#connectSupabaseBtn');
    if (btn) btn.onclick = showSupabaseConfigModal;
    return;
  }

  if (currentUser) {
    container.innerHTML = `
      <div class="side-cloud-header">
        <span>Cloud Sync</span>
        <span class="cloud-status-badge online">${cloudSyncing ? 'Syncing…' : '🟢 Synced'}</span>
      </div>
      <div class="cloud-user-email" title="${escapeHtml(currentUser.email)}">👤 ${escapeHtml(currentUser.email)}</div>
      <div class="side-cloud-actions">
        <button class="side-cloud-btn" id="manualSyncBtn" title="Sync now with cloud">☁️ Sync</button>
        <button class="side-cloud-btn" id="signOutBtn" title="Sign out">Log out</button>
      </div>
      <button class="text-button" id="configSupabaseSmallBtn" style="font-size:10px; padding:2px 0; color:#6b7b9d">⚙️ Settings</button>
    `;
    const syncBtn = $('#manualSyncBtn');
    const outBtn = $('#signOutBtn');
    const cfgBtn = $('#configSupabaseSmallBtn');
    if (syncBtn) syncBtn.onclick = () => syncToCloud(true);
    if (outBtn) outBtn.onclick = handleSignOut;
    if (cfgBtn) cfgBtn.onclick = showSupabaseConfigModal;
  } else {
    container.innerHTML = `
      <div class="side-cloud-header">
        <span>Cloud Sync</span>
        <span class="cloud-status-badge">Guest / Offline</span>
      </div>
      <button class="side-cloud-btn primary" id="authModalBtn">
        <span>🔑 Sign In / Sign Up</span>
      </button>
      <div class="side-cloud-actions">
        <button class="text-button" id="configSupabaseSmallBtn" style="font-size:10px; padding:2px 0; color:#6b7b9d">⚙️ Supabase Settings</button>
      </div>
    `;
    const authBtn = $('#authModalBtn');
    const cfgBtn = $('#configSupabaseSmallBtn');
    if (authBtn) authBtn.onclick = () => showAuthModal('login');
    if (cfgBtn) cfgBtn.onclick = showSupabaseConfigModal;
  }
}

function showAuthModal(initialTab = 'login') {
  let activeTab = initialTab;
  const root = $('#modalRoot');
  if (!root) return;

  function renderModal() {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" style="width: min(440px, 100%)">
          <div class="auth-tabs">
            <button class="auth-tab ${activeTab === 'login' ? 'active' : ''}" id="tabLoginBtn">Log In</button>
            <button class="auth-tab ${activeTab === 'signup' ? 'active' : ''}" id="tabSignupBtn">Sign Up</button>
          </div>
          <h3 style="margin-top:0">${activeTab === 'login' ? 'Log in to sync progress' : 'Create an account to save online'}</h3>
          <p class="auth-tip">Sign in with your email and password to automatically save your XP, streaks, and puzzle unlocks across your phone and PC.</p>
          
          <form class="auth-form" id="authForm">
            <div class="auth-field">
              <label>Email Address</label>
              <input type="email" id="authEmail" class="auth-input" placeholder="student@example.com" required autocomplete="email">
            </div>
            <div class="auth-field">
              <label>Password</label>
              <input type="password" id="authPassword" class="auth-input" placeholder="••••••••" required minlength="6" autocomplete="${activeTab === 'login' ? 'current-password' : 'new-password'}">
            </div>
            <div id="authErrorMsg" class="auth-error"></div>
            <div class="actions" style="margin-top:8px">
              <button type="submit" class="btn" id="authSubmitBtn" style="flex:1">${activeTab === 'login' ? 'Log In' : 'Sign Up'}</button>
              <button type="button" class="btn secondary" id="authCancelBtn">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;

    $('#tabLoginBtn').onclick = () => { activeTab = 'login'; renderModal(); };
    $('#tabSignupBtn').onclick = () => { activeTab = 'signup'; renderModal(); };
    $('#authCancelBtn').onclick = () => { root.innerHTML = ''; };
    $('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
    });

    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#authEmail').value.trim();
      const password = $('#authPassword').value;
      const errorDiv = $('#authErrorMsg');
      const submitBtn = $('#authSubmitBtn');
      errorDiv.classList.remove('show');
      errorDiv.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait…';

      try {
        if (!supabaseClient) throw new Error('Supabase is not configured yet. Please enter your project URL and key.');
        if (activeTab === 'login') {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          currentUser = data.user;
          updateCloudUI();
          root.innerHTML = '';
          toast(`Signed in as ${email}! Syncing… ☁️`);
          syncFromCloud();
        } else {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error) throw error;
          if (data.session) {
            currentUser = data.user;
            updateCloudUI();
            root.innerHTML = '';
            toast(`Account created! Signed in as ${email} ☁️`);
            syncToCloud();
          } else {
            root.innerHTML = '';
            toast('Account created! Please check your email or log in.');
          }
        }
      } catch (err) {
        errorDiv.textContent = err.message || String(err);
        errorDiv.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = activeTab === 'login' ? 'Log In' : 'Sign Up';
        playError();
      }
    };
  }

  renderModal();
}

function showSupabaseConfigModal() {
  const root = $('#modalRoot');
  if (!root) return;
  const cfg = getSupabaseConfig() || { url: '', anonKey: '' };

  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="width: min(520px, 100%)">
        <h3 style="margin-top:0">⚙️ Supabase Cloud Configuration</h3>
        <p class="auth-tip">Connect to your Supabase project to enable Email/Password login and online progress sync across all your devices.</p>
        
        <form class="auth-form" id="supabaseConfigForm">
          <div class="auth-field">
            <label>Supabase Project URL</label>
            <input type="url" id="cfgUrl" class="auth-input" placeholder="https://xyzcompany.supabase.co" value="${escapeHtml(cfg.url)}" required>
          </div>
          <div class="auth-field">
            <label>Supabase Anon Key (Public Key)</label>
            <input type="text" id="cfgAnonKey" class="auth-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." value="${escapeHtml(cfg.anonKey)}" required>
          </div>

          <div style="margin-top:6px">
            <label style="font-size:11px; font-weight:700; color:var(--muted); display:block; margin-bottom:5px">
              Required Supabase Table (You can run this in your existing <code>mips-mastery</code> project alongside <code>mips_progress</code>):
            </label>
            <div class="sql-copy-box">CREATE TABLE IF NOT EXISTS public.nexasql_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.nexasql_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own nexasql progress"
  ON public.nexasql_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);</div>
          </div>

          <div class="actions" style="margin-top:12px">
            <button type="submit" class="btn" style="flex:1">Save & Connect</button>
            <button type="button" class="btn secondary" id="cfgCancelBtn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $('#cfgCancelBtn').onclick = () => { root.innerHTML = ''; };
  $('.modal-backdrop').addEventListener('click', e => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  });

  $('#supabaseConfigForm').onsubmit = (e) => {
    e.preventDefault();
    const url = $('#cfgUrl').value.trim();
    const key = $('#cfgAnonKey').value.trim();
    saveSupabaseConfig(url, key);
    root.innerHTML = '';
    toast('Supabase settings saved! ☁️');
    if (!currentUser) {
      showAuthModal('login');
    }
  };
}

// --- AUDIO EFFECTS ENGINE (Web Audio API) ---
let audioCtx = null;
let soundMuted = localStorage.getItem('nexasql_sound_muted') === 'true';

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSoundTone(freqs, type = 'sine', duration = 0.15, gainVal = 0.1) {
  if (soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, now + idx * 0.07);
      gain.gain.setValueAtTime(gainVal, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + duration);
    });
  } catch (e) {}
}

function playSnap() { playSoundTone([480], 'triangle', 0.07, 0.08); }
function playClick() { playSoundTone([320], 'sine', 0.05, 0.05); }
function playSuccess() { playSoundTone([523.25, 659.25, 783.99, 1046.50], 'sine', 0.22, 0.12); }
function playError() { playSoundTone([220, 185], 'sawtooth', 0.16, 0.08); }
function playFanfare() { playSoundTone([523.25, 659.25, 783.99, 1046.50, 1318.51], 'triangle', 0.35, 0.14); }

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem('nexasql_sound_muted', soundMuted);
  updateSoundButtonUI();
  if (!soundMuted) playSnap();
  toast(soundMuted ? 'Sound muted 🔇' : 'Sound enabled 🔊');
}

function updateSoundButtonUI() {
  const btn = $('#soundToggleBtn');
  if (btn) {
    btn.textContent = soundMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', soundMuted);
  }
}

// --- CONFETTI ANIMATION ENGINE ---
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#7c8cff', '#54d7c5', '#f5c76f', '#62d49d', '#ff7b87', '#bd7cff'];
  for (let i = 0; i < 75; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.45 + (Math.random() - 0.5) * 100,
      w: Math.random() * 8 + 6,
      h: Math.random() * 5 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.9) * 16,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      alpha: 1
    });
  }

  const start = performance.now();
  function draw(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rot += p.vRot;
      p.alpha = Math.max(0, 1 - elapsed / 2200);
      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    if (alive && elapsed < 2500) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(draw);
}

async function init() {
  bindShell();
  bindAuthGate();
  updateSoundButtonUI();
  await initSupabase();
  await initDatabase();
  updateStreak(false);
  renderAll();
  $('#boot').classList.add('hidden');
  if (currentUser) {
    showApp(currentUser);
  } else {
    showAuthGate();
  }
}

function bindShell() {
  $$('#nav .nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
  const soundBtn = $('#soundToggleBtn');
  const mobileMenu = $('#mobileMenuBtn');
  const sidebarOverlay = $('#sidebarOverlay');
  const exportBtn = $('#exportProgressBtn');
  const importInput = $('#importProgressInput');
  if (soundBtn) soundBtn.addEventListener('click', toggleSound);
  const closeSidebar = () => {
    $('.sidebar')?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');
  };
  if (mobileMenu) {
    mobileMenu.addEventListener('click', () => {
      const isOpen = $('.sidebar')?.classList.toggle('open');
      sidebarOverlay?.classList.toggle('active', !!isOpen);
    });
  }
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  if (exportBtn) exportBtn.addEventListener('click', exportProgress);
  if (importInput) importInput.addEventListener('change', importProgress);
}

async function initDatabase() {
  try {
    setBoot('Loading PostgreSQL in your browser…');
    db = await PGlite.create(`idb://${DB_VERSION}`, { relaxedDurability: true });
    const exists = await db.query(`SELECT to_regclass('public.nexasql_meta') AS table_name;`);
    let seeded = false;
    if (exists.rows[0]?.table_name) {
      const r = await db.query(`SELECT value FROM nexasql_meta WHERE key='seed_version';`);
      seeded = r.rows[0]?.value === '5';
    }
    if (!seeded) await seedDatabase();
    setBoot('Ready.');
  } catch (err) {
    console.error(err);
    $('#bootMessage').innerHTML = `Could not start the local database.<br><br><strong>${escapeHtml(err.message || String(err))}</strong><br><br>Make sure you are online for the first launch and open the site through <code>http://localhost:8080</code>.`;
    throw err;
  }
}

function setBoot(message) { $('#bootMessage').textContent = message; }

async function seedDatabase() {
  setBoot('Creating the NexaCart star schema…');
  await db.exec(`
    DROP TABLE IF EXISTS fact_order_items CASCADE;
    DROP TABLE IF EXISTS dim_customer CASCADE;
    DROP TABLE IF EXISTS dim_product CASCADE;
    DROP TABLE IF EXISTS dim_seller CASCADE;
    DROP TABLE IF EXISTS dim_payment CASCADE;
    DROP TABLE IF EXISTS dim_shipping CASCADE;
    DROP TABLE IF EXISTS nexasql_meta CASCADE;

    CREATE TABLE dim_customer (
      customer_id BIGINT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      city TEXT NOT NULL
    );
    CREATE TABLE dim_product (
      product_id BIGINT PRIMARY KEY,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT NOT NULL
    );
    CREATE TABLE dim_seller (
      seller_id BIGINT PRIMARY KEY,
      shop_name TEXT NOT NULL,
      seller_city TEXT NOT NULL
    );
    CREATE TABLE dim_payment (
      payment_id BIGINT PRIMARY KEY,
      payment_method TEXT NOT NULL
    );
    CREATE TABLE dim_shipping (
      shipping_id BIGINT PRIMARY KEY,
      shipping_method TEXT NOT NULL,
      courier_name TEXT NOT NULL
    );
    CREATE TABLE fact_order_items (
      order_item_id BIGINT PRIMARY KEY,
      order_number TEXT NOT NULL,
      order_date DATE NOT NULL,
      customer_id BIGINT NOT NULL REFERENCES dim_customer(customer_id),
      product_id BIGINT NOT NULL REFERENCES dim_product(product_id),
      seller_id BIGINT NOT NULL REFERENCES dim_seller(seller_id),
      payment_id BIGINT NOT NULL REFERENCES dim_payment(payment_id),
      shipping_id BIGINT NOT NULL REFERENCES dim_shipping(shipping_id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      discount_amount NUMERIC(12,2) NOT NULL CHECK (discount_amount >= 0),
      shipping_fee NUMERIC(12,2) NOT NULL CHECK (shipping_fee >= 0),
      gross_sales NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
      net_sales NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((quantity * unit_price) - discount_amount, 2)) STORED,
      total_paid NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((quantity * unit_price) - discount_amount + shipping_fee, 2)) STORED
    );
    CREATE INDEX idx_fact_date ON fact_order_items(order_date);
    CREATE INDEX idx_fact_customer ON fact_order_items(customer_id);
    CREATE INDEX idx_fact_product ON fact_order_items(product_id);
    CREATE INDEX idx_fact_seller ON fact_order_items(seller_id);
    CREATE TABLE nexasql_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const customers = buildCustomers();
  const products = buildProducts();
  const sellers = buildSellers();
  const payments = ['GCash','Maya','Cash on Delivery','Credit/Debit Card','Online Banking'];
  const shipping = [
    ['Standard Delivery','J&T Express'],
    ['Standard Delivery','SPX Express'],
    ['Express Delivery','SPX Express'],
    ['Standard Delivery','Ninja Van'],
    ['Economy Delivery','Flash Express']
  ];

  setBoot('Adding realistic customers, products, sellers, payment and shipping dimensions…');
  await db.exec('BEGIN;');
  try {
    await insertBatched('dim_customer',['customer_id','customer_name','city'],customers.map(x=>[x.id,x.name,x.city]),250);
    await insertBatched('dim_product',['product_id','product_name','category','brand'],products.map(x=>[x.id,x.name,x.category,x.brand]),150);
    await insertBatched('dim_seller',['seller_id','shop_name','seller_city'],sellers.map(x=>[x.id,x.name,x.city]),50);
    await insertBatched('dim_payment',['payment_id','payment_method'],payments.map((x,i)=>[i+1,x]),10);
    await insertBatched('dim_shipping',['shipping_id','shipping_method','courier_name'],shipping.map((x,i)=>[i+1,...x]),10);

    setBoot('Generating 10,000 orders and 25,000 order-item records…');
    const facts = buildFacts(customers, products, sellers);
    for (let i=0; i<facts.length; i+=500) {
      const pct = Math.round((i/facts.length)*100);
      setBoot(`Generating the practice dataset… ${pct}%`);
      const chunk = facts.slice(i,i+500);
      await insertBatched('fact_order_items',[
        'order_item_id','order_number','order_date','customer_id','product_id','seller_id','payment_id','shipping_id','quantity','unit_price','discount_amount','shipping_fee'
      ], chunk.map(x=>[x.id,x.orderNumber,x.date,x.customerId,x.productId,x.sellerId,x.paymentId,x.shippingId,x.quantity,x.unitPrice,x.discount,x.shippingFee]),500);
    }
    await db.exec(`INSERT INTO nexasql_meta(key,value) VALUES ('seed_version','5'); COMMIT;`);
  } catch (e) {
    await db.exec('ROLLBACK;');
    throw e;
  }
}

async function insertBatched(table, columns, rows, batchSize=500) {
  for (let start=0; start<rows.length; start+=batchSize) {
    const batch = rows.slice(start,start+batchSize);
    const values = batch.map(row => `(${row.map(sqlValue).join(',')})`).join(',');
    await db.exec(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values};`);
  }
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replaceAll("'","''")}'`;
}

function buildCustomers() {
  const first = ['Maria','John','Angela','Mark','Patricia','Joshua','Camille','Daniel','Nicole','Paolo','Andrea','Christian','Sofia','Miguel','Jasmine','Carlo','Bianca','Nathan','Alyssa','Gabriel','Clarisse','Ryan','Isabella','Kevin','Danica'];
  const last = ['Santos','Reyes','Cruz','Garcia','Mendoza','Bautista','Ramos','Flores','Aquino','Castillo','Navarro','Fernandez','Villanueva','Torres','Diaz','Mercado','Rivera','Castro','Domingo','Salazar'];
  const cityCuts = [
    [90,'Manila'],[170,'Quezon City'],[230,'Cebu City'],[280,'Davao City'],[325,'Makati'],[370,'Pasig'],[410,'Taguig'],[445,'Antipolo'],[475,'Baguio'],[500,'Iloilo City']
  ];
  const out=[]; let id=1;
  for (const f of first) for (const l of last) {
    const city = cityCuts.find(([max])=>id<=max)[1];
    out.push({id,name:`${f} ${l}`,city}); id++;
  }
  return out;
}

function buildProducts() {
  const catalog = {
    'Electronics': ['Wireless Bluetooth Earbuds','Portable Bluetooth Speaker','Mechanical Gaming Keyboard','Wireless Optical Mouse','1080p USB Webcam','USB Condenser Microphone','Smart LED Desk Lamp','Mini Projector','Digital Alarm Clock','Rechargeable Desk Fan','Laptop Cooling Pad','USB Hub 4-Port','Wireless Presenter','Over-Ear Headphones','Portable Radio','LED Monitor Light Bar','Compact Power Strip','Smart Wi-Fi Plug','HDMI Streaming Adapter','Portable SSD Enclosure'],
    'Mobile Accessories': ['20W USB-C Fast Charger','30W GaN Wall Charger','10000mAh Power Bank','20000mAh Power Bank','USB-C to USB-C Cable 1m','USB-C to Lightning Cable','Braided USB-C Cable 2m','Magnetic Phone Stand','Adjustable Phone Holder','Tempered Glass Screen Protector','Shockproof Phone Case','Clear Phone Case','Car Phone Mount','Wireless Charging Pad','Phone Camera Lens Kit','Mini Selfie Tripod','Bluetooth Selfie Stick','SIM Card Organizer','USB-C OTG Adapter','Waterproof Phone Pouch'],
    'Fashion': ['Oversized Cotton T-Shirt','Classic Polo Shirt','Basic Crew Neck Shirt','Slim Fit Jeans','Straight Leg Jeans','Cargo Pants','Cotton Jogger Pants','Lightweight Hoodie','Zip-Up Jacket','Casual Shorts','Running Shoes','Canvas Sneakers','Slide Sandals','Baseball Cap','Bucket Hat','Crossbody Bag','Canvas Tote Bag','Leather Belt','Crew Socks 5-Pack','Lightweight Rain Jacket'],
    'Beauty & Personal Care': ['Gentle Facial Cleanser 100ml','Vitamin C Serum 30ml','Niacinamide Serum 30ml','Daily Sunscreen SPF50','Hydrating Facial Moisturizer','Micellar Cleansing Water','Matte Lip Tint','Lip Balm SPF15','Waterproof Mascara','Eyebrow Pencil','Loose Face Powder','Body Lotion 250ml','Hand Cream 50ml','Shampoo 500ml','Conditioner 500ml','Hair Serum 50ml','Body Wash 500ml','Facial Sheet Mask 10-Pack','Clay Face Mask','Perfume Mist 100ml'],
    'Home & Living': ['Non-Stick Frying Pan 24cm','Stainless Steel Cooking Pot','Kitchen Knife Set','Bamboo Cutting Board','Food Storage Container Set','Insulated Tumbler 500ml','Vacuum Flask 1L','Microfiber Towel Set','Bedsheet Set Queen','Memory Foam Pillow','Foldable Laundry Basket','Storage Organizer Box','LED Night Light','Wall Clock','Digital Kitchen Scale','Electric Kettle 1.5L','Mini Rice Cooker','Dish Drying Rack','Silicone Kitchen Utensil Set','Bathroom Organizer Shelf'],
    'Groceries': ['Premium Instant Coffee 10-Pack','Ground Coffee 250g','Green Tea 25 Bags','Milk Tea Powder 500g','Chocolate Drink Mix 500g','Oatmeal 800g','Breakfast Cereal 500g','Peanut Butter 340g','Strawberry Jam 320g','Mixed Nuts 250g','Potato Chips 150g','Corn Snacks 150g','Chocolate Cookies 200g','Crackers 250g','Dried Mango 200g','Tuna Flakes 180g','Pasta 500g','Tomato Pasta Sauce 500g','Organic Brown Rice 2kg','Mineral Water 12-Pack'],
    'Sports & Outdoors': ['Yoga Mat 6mm','Resistance Band Set','Adjustable Jump Rope','Dumbbell Pair 5kg','Kettlebell 8kg','Sports Water Bottle 1L','Running Waist Bag','Cycling Gloves','Quick-Dry Sports Shirt','Compression Leggings','Basketball Size 7','Badminton Racket Set','Foam Roller','Push-Up Board','Portable Camping Chair'],
    'Office & School': ['A5 Ruled Notebook 3-Pack','Gel Pen Set 12 Colors','Ballpoint Pen 10-Pack','Highlighter Set 6 Colors','Mechanical Pencil Set','Sticky Notes 8-Pack','Desk Organizer','File Folder Set','Document Envelope 10-Pack','Scientific Calculator','Wireless Numeric Keypad','Laptop Stand Aluminum','Ergonomic Mouse Pad','Whiteboard Marker Set','Printer Paper A4 500 Sheets']
  };
  const brands = {
    'Electronics':['NovaTech','ByteWave','SoundPeak','Lumio','NexaGear'],
    'Mobile Accessories':['ChargePro','Voltix','MobileNest','NexaGear','PowerCore'],
    'Fashion':['UrbanThread','ModeLine','StreetForm','DailyWear','NorthLane'],
    'Beauty & Personal Care':['LumiSkin','PureGlow','BelleCare','FreshAura','DermaDaily'],
    'Home & Living':['HomeCraft','NestLiving','CasaPrime','DailyHome','CookWell'],
    'Groceries':['DailyMart','FreshField','BrewHouse','NutriChoice','PantryCo'],
    'Sports & Outdoors':['ActiveGo','PeakFit','MotionLab','Sportiva','TrailCore'],
    'Office & School':['PaperNest','WorkMate','StudyPro','DeskLine','OfficeCore']
  };
  const ranges = {
    'Electronics':[499,4999], 'Mobile Accessories':[99,1499], 'Fashion':[199,1299], 'Beauty & Personal Care':[99,599],
    'Home & Living':[199,1499], 'Groceries':[49,399], 'Sports & Outdoors':[199,1499], 'Office & School':[39,899]
  };
  const popularNames = new Set(['Wireless Bluetooth Earbuds','20W USB-C Fast Charger','10000mAh Power Bank','Oversized Cotton T-Shirt','Running Shoes','Gentle Facial Cleanser 100ml','Daily Sunscreen SPF50','Non-Stick Frying Pan 24cm','Insulated Tumbler 500ml','Premium Instant Coffee 10-Pack','Potato Chips 150g','Yoga Mat 6mm','A5 Ruled Notebook 3-Pack','Gel Pen Set 12 Colors','Laptop Stand Aluminum']);
  const out=[]; let id=1;
  for (const [category,names] of Object.entries(catalog)) {
    names.forEach((name,i)=>{
      const [min,max]=ranges[category];
      const raw=min + (hashInt(id*73 + i*31) % (max-min+1));
      const basePrice = category==='Groceries' || category==='Office & School' ? Math.max(min,Math.round(raw/10)*10-1) : Math.max(min,Math.round(raw/50)*50-1);
      const weight = popularNames.has(name) ? 8 : (i<7 ? 4 : i<14 ? 2.3 : 1.2);
      out.push({id,name,category,brand:brands[category][i%brands[category].length],basePrice,weight}); id++;
    });
  }
  return out;
}

function buildSellers() {
  const rows = [
    ['ByteHub PH','Manila'],['Gadget Grove','Quezon City'],['VoltCart Mobile','Makati'],['TechNest Store','Pasig'],['SoundSpace PH','Taguig'],
    ['Urban Wardrobe','Manila'],['ThreadLine PH','Quezon City'],['Daily Fits','Cebu City'],['NorthLane Fashion','Davao City'],['StreetMode Store','Makati'],
    ['GlowLab Beauty','Manila'],['PureSkin PH','Quezon City'],['BelleCare Store','Cebu City'],['FreshAura Beauty','Davao City'],
    ['HomeCraft Market','Manila'],['Casa Living','Quezon City'],['Nest and Home','Pasig'],['Kitchen Corner PH','Cebu City'],
    ['Daily Pantry','Manila'],['Fresh Basket PH','Quezon City'],['Brew and Bites','Baguio'],['Snack Station PH','Iloilo City'],
    ['ActiveGear PH','Manila'],['PeakFit Store','Cebu City'],['Motion Sports','Davao City'],
    ['PaperTrail Supplies','Quezon City'],['StudyHub PH','Manila'],['WorkDesk Store','Makati'],['OfficeNest','Pasig'],['Nexa General Store','Taguig']
  ];
  return rows.map((x,i)=>({id:i+1,name:x[0],city:x[1]}));
}

function buildFacts(customers, products, sellers) {
  const monthly = [
    ['2024-01',210],['2024-02',205],['2024-03',215],['2024-04',220],['2024-05',225],['2024-06',230],['2024-07',235],['2024-08',260],['2024-09',330],['2024-10',270],['2024-11',370],['2024-12',430],
    ['2025-01',250],['2025-02',245],['2025-03',260],['2025-04',270],['2025-05',275],['2025-06',285],['2025-07',290],['2025-08',325],['2025-09',400],['2025-10',320],['2025-11',500],['2025-12',580],
    ['2026-01',310],['2026-02',300],['2026-03',320],['2026-04',330],['2026-05',340],['2026-06',350],['2026-07',360],['2026-08',490]
  ];
  const orderDates=[];
  let seq=1;
  for (const [ym,count] of monthly) {
    const [y,m]=ym.split('-').map(Number);
    const days=new Date(Date.UTC(y,m,0)).getUTCDate();
    for(let i=0;i<count;i++) {
      const day=1+(hashInt(seq*17+y*13+m*7)%days);
      orderDates.push(`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`); seq++;
    }
  }

  const orderSizes = Array(10000);
  const perm=[];
  for(let i=1;i<=10000;i++) perm.push({i,key:hashInt(i*7919)});
  perm.sort((a,b)=>a.key-b.key);
  perm.forEach((x,idx)=> orderSizes[x.i-1] = idx<1500?1:idx<5500?2:idx<8500?3:idx<9500?4:5);

  // Shuffled customer activity tiers.
  const activity = customers.map(c=>({id:c.id,key:hashInt(c.id*3571)})).sort((a,b)=>a.key-b.key);
  const customerWeight = new Map();
  activity.forEach((c,idx)=> customerWeight.set(c.id, idx<25?7:idx<100?3.5:idx<250?1.8:1));
  const customerWeighted = customers.map(c=>({item:c,weight:customerWeight.get(c.id)}));

  const byCategory = {};
  for (const p of products) (byCategory[p.category] ||= []).push(p);
  const categoryList = Object.keys(byCategory);
  const sellerMap = {
    'Electronics':[1,2,3,4,5], 'Mobile Accessories':[1,2,3,4,5], 'Fashion':[6,7,8,9,10],
    'Beauty & Personal Care':[11,12,13,14], 'Home & Living':[15,16,17,18], 'Groceries':[19,20,21,22],
    'Sports & Outdoors':[23,24,25], 'Office & School':[26,27,28,29]
  };
  const cityBoost = {
    'Manila':['Electronics','Mobile Accessories'], 'Quezon City':['Home & Living','Office & School'],
    'Cebu City':['Beauty & Personal Care','Fashion'], 'Davao City':['Home & Living','Groceries'],
    'Makati':['Electronics','Beauty & Personal Care'], 'Pasig':['Mobile Accessories','Home & Living'],
    'Taguig':['Electronics','Fashion'], 'Antipolo':['Home & Living','Groceries'],
    'Baguio':['Fashion','Sports & Outdoors'], 'Iloilo City':['Groceries','Home & Living']
  };
  const baseCat = {'Electronics':14,'Mobile Accessories':12,'Fashion':13,'Beauty & Personal Care':12,'Home & Living':14,'Groceries':13,'Sports & Outdoors':10,'Office & School':12};

  const facts=[]; let factId=1;
  for(let o=1;o<=10000;o++) {
    const date=orderDates[o-1]; const year=Number(date.slice(0,4)); const month=Number(date.slice(5,7));
    const rng=mulberry32(hashInt(o*104729));
    const customer = o<=500 ? customers[(o*137)%500] : weightedPick(customerWeighted,rng);
    const catWeights = categoryList.map(cat=>({item:cat,weight:baseCat[cat] + (cityBoost[customer.city]?.includes(cat)?10:0) + seasonBoost(cat,month)}));
    const category = weightedPick(catWeights,rng);
    const sellersForCat=sellerMap[category];
    let sellerId;
    if (rng()<0.04) sellerId=30;
    else {
      const localWeights=sellersForCat.map((sid,idx)=>({item:sid,weight:idx===0?3.2:idx===1?2.5:idx===2?1.8:idx===3?1.4:1}));
      sellerId=weightedPick(localWeights,rng);
    }
    const paymentId = paymentChoice(year,rng);
    const itemCount=orderSizes[o-1];
    const chosen=weightedSampleWithoutReplacement(byCategory[category].map(p=>({item:p,weight:p.weight})), itemCount, rng);
    const temp=[];
    for (const p of chosen) {
      const quantity=quantityFor(category,rng);
      const sellerFactor = 1 + (((sellerId%5)-2)*0.01);
      const yearFactor = year===2024?1:year===2025?1.03:1.05;
      const unitPrice=round2(p.basePrice*sellerFactor*yearFactor);
      const gross=round2(unitPrice*quantity);
      const rate=discountRate(month,rng);
      const discount=round2(gross*rate);
      temp.push({p,quantity,unitPrice,gross,discount,net:round2(gross-discount)});
    }
    const orderGross=round2(temp.reduce((s,x)=>s+x.gross,0));
    const ship=shippingChoice(orderGross, customer.city, sellers.find(s=>s.id===sellerId)?.city || '', month, rng);
    let allocated=0;
    temp.forEach((x,idx)=>{
      const shippingFee = idx===temp.length-1 ? round2(ship.fee-allocated) : round2(ship.fee * (x.gross/orderGross));
      allocated=round2(allocated+shippingFee);
      facts.push({
        id:factId++, orderNumber:`NXC-${year}-${String(o).padStart(5,'0')}`, date, customerId:customer.id, productId:x.p.id,
        sellerId, paymentId, shippingId:ship.id, quantity:x.quantity, unitPrice:x.unitPrice, discount:x.discount, shippingFee
      });
    });
  }
  return facts;
}

function seasonBoost(cat,m) {
  if (m===1 && cat==='Sports & Outdoors') return 8;
  if (m===2 && cat==='Beauty & Personal Care') return 8;
  if ([5,6,7].includes(m) && cat==='Office & School') return 7;
  if (m===8 && ['Electronics','Mobile Accessories'].includes(cat)) return 4;
  if (m===9 && cat==='Electronics') return 10;
  if (m===9 && cat==='Mobile Accessories') return 8;
  if (m===11 && cat==='Electronics') return 12;
  if (m===11 && cat==='Fashion') return 8;
  if (m===12 && ['Electronics','Home & Living'].includes(cat)) return 8;
  if (m===12 && cat==='Groceries') return 6;
  return 0;
}
function quantityFor(cat,rng) {
  const r=rng();
  if(cat==='Electronics') return r<.85?1:r<.99?2:3;
  if(['Mobile Accessories','Fashion'].includes(cat)) return r<.65?1:r<.9?2:r<.98?3:4;
  if(cat==='Beauty & Personal Care') return r<.55?1:r<.8?2:r<.95?3:4;
  if(cat==='Groceries') return r<.35?1:r<.65?2:r<.85?3:r<.95?4:5;
  if(['Home & Living','Sports & Outdoors'].includes(cat)) return r<.75?1:r<.95?2:3;
  return r<.45?1:r<.75?2:r<.9?3:r<.97?4:5;
}
function discountRate(month,rng){const r=rng(); if([9,11,12].includes(month)) return r<.25?0:r<.45?.05:r<.7?.10:r<.9?.15:.20; if(month===8) return r<.4?0:r<.6?.05:r<.8?.10:r<.95?.15:.20; return r<.6?0:r<.8?.05:r<.92?.10:r<.98?.15:.20;}
function paymentChoice(year,rng){const r=rng(); if(year===2024) return r<.28?1:r<.38?2:r<.72?3:r<.90?4:5; if(year===2025) return r<.31?1:r<.43?2:r<.72?3:r<.92?4:5; return r<.34?1:r<.48?2:r<.72?3:r<.94?4:5;}
function shippingChoice(gross, customerCity, sellerCity, month, rng){
  const r=rng(); let id;
  if(gross>=5000) id=r<.24?1:r<.54?2:r<.76?3:r<.92?4:5;
  else if(gross>=2000) id=r<.29?1:r<.58?2:r<.73?3:r<.92?4:5;
  else id=r<.32?1:r<.60?2:r<.68?3:r<.88?4:5;
  let free = month===8 ? (gross>=3000?.40:gross>=1500?.25:.10) : [9,11,12].includes(month) ? (gross>=3000?.55:gross>=1500?.35:.15) : (gross>=3000?.30:gross>=1500?.15:.05);
  if(id===3) free=Math.max(0,free-.10);
  if(rng()<free) return {id,fee:0};
  const base=[0,59,49,99,69,39][id];
  let surcharge=0;
  if(customerCity!==sellerCity) surcharge=['Cebu City','Davao City','Iloilo City'].includes(customerCity)?30:customerCity==='Baguio'?20:10;
  return {id,fee:base+surcharge};
}
function weightedPick(items,rng){const total=items.reduce((s,x)=>s+x.weight,0); let r=rng()*total; for(const x of items){r-=x.weight;if(r<=0)return x.item;} return items.at(-1).item;}
function weightedSampleWithoutReplacement(items,count,rng){const pool=items.map(x=>({...x})); const out=[]; for(let i=0;i<count;i++){const pick=weightedPick(pool,rng);out.push(pick);pool.splice(pool.findIndex(x=>x.item===pick),1);} return out;}
function hashInt(x){x|=0; x=((x>>>16)^x)*0x45d9f3b; x=((x>>>16)^x)*0x45d9f3b; x=(x>>>16)^x; return x>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}
function round2(n){return Math.round((n+Number.EPSILON)*100)/100;}

function emptyLadder() {
  return Object.fromEntries(Object.keys(PATTERNS).map(k=>[k,{'1':[],'2':[],'3':[],'4':[]}]))
}
function defaultProgress() {
  return {
    version: 5,
    xp: 0,
    patternScores: Object.fromEntries(Object.keys(PATTERNS).map(k=>[k,0])),
    ladder: emptyLadder(),
    questionStats: {},
    recent: [],
    streak: {count:0,lastStudy:null},
    mockHistory: [],
    lessonViews: {},
    flashcardMastered: [],
    createdAt: new Date().toISOString()
  };
}
function normalizeLadder(raw={}) {
  const base=emptyLadder();
  for (const pid of Object.keys(PATTERNS)) {
    const src=raw?.[pid]||{};
    for (const n of ['1','2','3','4']) base[pid][n]=Array.isArray(src[n])?[...new Set(src[n])]:[];
  }
  return base;
}
function loadProgress(){try{const raw=localStorage.getItem(PROGRESS_KEY); if(!raw)return defaultProgress(); const p=JSON.parse(raw); return {...defaultProgress(),...p,patternScores:{...defaultProgress().patternScores,...(p.patternScores||{})},ladder:normalizeLadder(p.ladder),flashcardMastered:Array.isArray(p.flashcardMastered)?p.flashcardMastered:[]};}catch{return defaultProgress();}}
function saveProgress(){
  localStorage.setItem(PROGRESS_KEY,JSON.stringify(state));
  updateTopStats();
  if(supabaseClient && currentUser){
    syncToCloud(false);
  }
}
function readiness(){return Math.round(Object.values(state.patternScores).reduce((a,b)=>a+b,0)/Object.keys(PATTERNS).length);}
function stageFor(score){return score<35?'Guided':score<70?'Coached':'Exam-ready';}
const LADDER_STAGES = {
  1:{title:'Arrange lines',short:'See the SQL pattern',icon:'↕'},
  2:{title:'Build from blocks',short:'Put SQL pieces together',icon:'▦'},
  3:{title:'Fill the gaps',short:'Recall missing pieces',icon:'✎'},
  4:{title:'Type from scratch',short:'Answer like the midterm',icon:'⌨'}
};
function solvedAt(pattern,stage){return state.ladder?.[pattern]?.[String(stage)]||[];}
function unlockedStage(pattern){
  const score=state.patternScores[pattern]||0;
  let unlocked=1;
  if(solvedAt(pattern,1).length>=2 || score>=30) unlocked=2;
  if(solvedAt(pattern,2).length>=2 || score>=50) unlocked=3;
  if(solvedAt(pattern,3).length>=2 || score>=70) unlocked=4;
  return unlocked;
}
function ladderProgress(pattern,stage){return Math.min(2,solvedAt(pattern,stage).length);}
function ladderSummary(pattern){const u=unlockedStage(pattern); const info=LADDER_STAGES[u]; return `${info.title}${u<4?` · ${ladderProgress(pattern,u)}/2`:''}`;}
function updateStreak(studied=true){
  if(!studied) return updateTopStats();
  const today=new Date().toISOString().slice(0,10); const last=state.streak.lastStudy;
  if(last===today) return;
  if(last){const a=new Date(last+'T00:00:00'),b=new Date(today+'T00:00:00');const days=Math.round((b-a)/86400000);state.streak.count=days===1?state.streak.count+1:1;} else state.streak.count=1;
  state.streak.lastStudy=today; saveProgress();
}
function updateTopStats(){
  const r=readiness();
  const readinessText=$('#sideReadiness');
  const readinessBar=$('#sideReadinessBar');
  const streak=$('#streakValue');
  const xp=$('#xpValue');
  if(readinessText) readinessText.textContent=`${r}%`;
  if(readinessBar) readinessBar.style.width=`${r}%`;
  if(streak) streak.textContent=state.streak.count;
  if(xp) xp.textContent=state.xp;
}

function renderAll(){updateTopStats();updateCloudUI();renderHome();renderLearn();renderFlashcards();renderPractice();renderMock();renderCheat();renderSchema();}
function navigate(page){
  currentPage=page;
  $$('.page').forEach(x=>x.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  $$('#nav .nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  const titles={home:['MIDTERM STUDY','Home'],learn:['CORE PATTERNS','Learn'],flashcards:['ACTIVE RECALL','SQL Flashcards'],practice:['ACTIVE PRACTICE','Practice'],mock:['EXAM MODE','Mock Midterm'],cheatsheet:['QUICK REFERENCE','Cheat Sheet'],schema:['YOUR DATABASE','Schema']};
  $('#pageEyebrow').textContent=titles[page][0];
  $('#pageTitle').textContent=titles[page][1];
  $('.sidebar')?.classList.remove('open');
  $('#sidebarOverlay')?.classList.remove('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if(page==='home')renderHome();
  if(page==='flashcards')renderFlashcards();
  if(page==='practice')renderPractice();
  if(page==='mock')renderMock();
}

function renderHome(){
  const weak=weakestPattern(); const solved=Object.values(state.questionStats).filter(x=>x.correct).length; const attempts=Object.values(state.questionStats).reduce((s,x)=>s+(x.attempts||0),0); const mockBest=state.mockHistory.length?Math.max(...state.mockHistory.map(x=>x.score)):0;
  $('#page-home').innerHTML=`
    <div class="hero">
      <div class="hero-grid">
        <div>
          <div class="eyebrow">FOCUS ON WHAT SIR IS MOST LIKELY TO ASK</div>
          <h1>Recognize the pattern first.<br>Type SQL only when you are ready.</h1>
          <p>Each business-question pattern now uses a four-step ladder: arrange SQL lines, build from smaller blocks, fill the gaps, then type the query from scratch. The goal is pattern recognition before memorization.</p>
          <div class="actions"><button class="btn" id="continueBtn">Continue with ${escapeHtml(PATTERNS[weak].title)}</button><button class="btn secondary" id="quickBtn">Practice weakest pattern</button></div>
        </div>
        <div class="focus-card">
          <div class="eyebrow">ONE RULE TO REMEMBER</div>
          <h3>See → arrange → complete → type.</h3>
          <p>You will repeatedly see the same SQL shape until it feels familiar.</p>
          <div class="code-block">Sales → SUM(net_sales)\nOrders → COUNT(DISTINCT order_number)\nUnits → SUM(quantity)\nCustomer spending → SUM(total_paid)</div>
        </div>
      </div>
    </div>
    <div class="section grid-4">
      ${statCard('Midterm readiness',readiness()+'%','Average mastery across six patterns')}
      ${statCard('Questions solved',solved,'Correct at least once')}
      ${statCard('Total attempts',attempts,'Every query check counts')}
      ${statCard('Best mock',mockBest ? `${mockBest}/10` : '—','Your strongest mock result')}
    </div>
    <div class="section">
      <div class="section-head"><div><h3>Your six patterns</h3><p>Master these first. Advanced SQL can wait until after the midterm.</p></div></div>
      <div class="grid-3">${Object.values(PATTERNS).map(patternCard).join('')}</div>
    </div>
    <div class="section grid-2">
      <div class="card">
        <div class="section-head"><div><h3>Recent practice</h3><p>Your latest attempts.</p></div></div>
        ${state.recent.length?state.recent.slice(0,6).map(r=>`<div class="metric-row"><span>${escapeHtml(r.prompt)}</span><code>${r.correct?'✓ correct':'↻ review'}</code></div>`).join(''):'<div class="empty-state">No practice yet. Start with the recommended pattern.</div>'}
      </div>
      <div class="card">
        <div class="section-head"><div><h3>Backup your progress</h3><p>Your progress lives in this browser. Export occasionally.</p></div></div>
        <div class="actions"><button class="btn secondary" id="homeExportBtn">Export progress</button><label class="btn ghost file-button">Import progress<input id="homeImportInput" type="file" accept="application/json,.json"></label><button class="btn danger small" id="resetProgressBtn">Reset progress</button></div>
      </div>
    </div>`;
  $('#continueBtn').onclick=()=>{practiceMode=weak;practiceStage=unlockedStage(weak);currentQuestion=null;puzzleState=null;navigate('practice');};
  $('#quickBtn').onclick=()=>startQuickPractice();
  $('#homeExportBtn').onclick=exportProgress;
  $('#homeImportInput').onchange=importProgress;
  $('#resetProgressBtn').onclick=confirmReset;
  $$('.pattern-card').forEach(c=>c.onclick=()=>{currentLesson=c.dataset.pattern;navigate('learn');renderLearn();});
}
function statCard(label,value,foot){return `<div class="card stat-card"><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;}
function patternCard(p){const s=state.patternScores[p.id]||0;const stage=stageFor(s);return `<div class="card pattern-card" data-pattern="${p.id}"><div class="pattern-top"><div class="pattern-number">${p.number}</div><span class="stage-badge ${stage==='Exam-ready'?'ready':''}">${stage}</span></div><h4>${p.title}</h4><p>${p.short}</p><div class="ladder-mini"><span>Learning step</span><strong>${escapeHtml(ladderSummary(p.id))}</strong></div><div class="progress-row"><div class="progress-label"><span>Mastery</span><span>${s}%</span></div><div class="progress-track"><span style="width:${s}%"></span></div></div></div>`;}
function weakestPattern(){return Object.keys(PATTERNS).sort((a,b)=>(state.patternScores[a]||0)-(state.patternScores[b]||0))[0];}

function renderLearn(){
  const p=PATTERNS[currentLesson];
  const unlocked=unlockedStage(p.id);
  $('#page-learn').innerHTML=`<div class="lesson-layout"><div class="lesson-menu">${Object.values(PATTERNS).map(x=>`<button data-pattern="${x.id}" class="${x.id===currentLesson?'active':''}">${x.number}. ${x.title}<br><small>${x.short}</small></button>`).join('')}</div><div><div class="card lesson-content"><div class="eyebrow">PATTERN ${p.number}</div><h3>${p.title}</h3><p>${p.description}</p><div class="remember"><strong>Remember:</strong> ${p.memory}</div><div class="lesson-steps">${p.steps.map((s,i)=>`<div class="lesson-step"><b>${i+1}</b><div><strong>${s[0]}</strong><span>${s[1]}</span></div></div>`).join('')}</div><h4>Core example</h4><div class="code-block">${escapeHtml(p.example)}</div></div><div class="card section"><div class="section-head"><div><h3>How you will learn this pattern</h3><p>Recognition first. Blank-editor typing comes last.</p></div></div><div class="learning-ladder">${Object.entries(LADDER_STAGES).map(([n,st])=>{const num=Number(n), locked=num>unlocked, done=num<unlocked || (num===4 && solvedAt(p.id,4).length>0); const count=num<4?`${ladderProgress(p.id,num)}/2`:done?'started':'final'; return `<button class="ladder-step ${locked?'locked':''} ${num===unlocked?'current':''}" data-stage="${num}" ${locked?'disabled':''}><span class="ladder-icon">${st.icon}</span><span><b>${num}. ${st.title}</b><small>${st.short}</small></span><em>${done?'✓':count}</em></button>`;}).join('')}</div><div class="actions" style="margin-top:16px"><button class="btn" id="lessonPracticeBtn">Start ${escapeHtml(LADDER_STAGES[unlocked].title)}</button><button class="btn secondary" id="lessonMarkBtn">I reviewed this lesson</button></div></div></div></div>`;
  $$('.lesson-menu button').forEach(b=>b.onclick=()=>{currentLesson=b.dataset.pattern;renderLearn();});
  $('#lessonPracticeBtn').onclick=()=>{practiceMode=currentLesson;practiceStage=unlockedStage(currentLesson);currentQuestion=null;puzzleState=null;navigate('practice');};
  $$('.ladder-step:not(.locked)').forEach(b=>b.onclick=()=>{practiceMode=currentLesson;practiceStage=Number(b.dataset.stage);currentQuestion=null;puzzleState=null;navigate('practice');});
  $('#lessonMarkBtn').onclick=()=>{state.lessonViews[currentLesson]=(state.lessonViews[currentLesson]||0)+1;state.xp+=3;updateStreak(true);saveProgress();toast('Lesson review saved. +3 XP');renderHome();};
}

function renderPractice(){
  const patternId = practiceMode==='weakest' ? weakestPattern() : practiceMode;
  const unlocked = unlockedStage(patternId);
  if (practiceStage > unlocked || practiceStage < 1) practiceStage = unlocked;
  if (!currentQuestion || currentQuestion.pattern !== patternId) {
    currentQuestion = pickQuestion(patternId, null, practiceStage);
    puzzleState = null;
    resetPracticeSession();
  }

  const p=PATTERNS[patternId];
  const score=state.patternScores[p.id]||0;
  const stageInfo=LADDER_STAGES[practiceStage];
  const solvedCount=practiceStage<4?ladderProgress(p.id,practiceStage):(solvedAt(p.id,4).length||0);

  $('#page-practice').innerHTML=`
    <div class="section-head"><div><h3>${p.title}</h3><p>Recognition ladder · mastery ${score}%</p></div><div class="actions"><select id="patternSelect" class="btn secondary">${Object.values(PATTERNS).map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${x.number}. ${x.title}</option>`).join('')}<option value="weakest">Weakest pattern</option></select><button class="btn ghost small" id="newQuestionBtn">New question</button></div></div>
    ${renderStageLadder(p.id,practiceStage)}
    <div class="practice-layout section">
      <div>
        <div class="card question-card">
          <div class="question-type">BUSINESS QUESTION</div>
          <h3>${escapeHtml(currentQuestion.prompt)}</h3>
          <div class="question-meta"><span class="pill">Pattern ${p.number}</span><span class="pill">${escapeHtml(stageInfo.title)}</span>${practiceSolved?'<span class="pill">✓ solved</span>':''}</div>
          ${currentQuestion.teacherClue ? `
          <div class="teacher-clue-card">
            <span class="teacher-clue-badge">💡 TEACHER CLUE</span>
            <span class="teacher-clue-text">${escapeHtml(currentQuestion.teacherClue)}</span>
          </div>` : ''}
          ${renderQuestionFormula(currentQuestion)}
        </div>
        ${renderPracticeStageWorkspace(currentQuestion, practiceStage)}
      </div>
      <aside>
        <div class="card"><div class="section-head"><div><h3>What you are training</h3><p>${escapeHtml(stageInfo.short)}</p></div></div>${renderStageCoach(practiceStage,currentQuestion)}</div>
        <div class="card" style="margin-top:16px"><h4 style="margin-top:0">Quick metric reminder</h4><div class="metric-list">${metricRowsMini()}</div></div>
        ${practiceStage===4?`<div class="card" style="margin-top:16px"><div class="section-head"><div><h3>Hints</h3><p>Use only when stuck.</p></div><span class="pill" id="hintCount">${Math.min(practiceHints,3)}/3 used</span></div><div id="hintArea" class="hint-list">${renderHints()}</div></div>`:''}
      </aside>
    </div>`;

  $('#patternSelect').onchange=e=>{practiceMode=e.target.value; const pid=e.target.value==='weakest'?weakestPattern():e.target.value; practiceStage=unlockedStage(pid); currentQuestion=null;puzzleState=null;resetPracticeSession();renderPractice();};
  $('#newQuestionBtn').onclick=()=>{currentQuestion=pickQuestion(p.id,currentQuestion?.id,practiceStage);puzzleState=null;resetPracticeSession();renderPractice();};
  $$('.ladder-tab:not(.locked)').forEach(b=>b.onclick=()=>{practiceStage=Number(b.dataset.stage);currentQuestion=pickQuestion(p.id,null,practiceStage);puzzleState=null;resetPracticeSession();renderPractice();});
  bindPracticeStageInteractions();
}

function renderStageLadder(pattern,current){
  const unlocked=unlockedStage(pattern);
  return `<div class="learning-ladder practice-ladder">${Object.entries(LADDER_STAGES).map(([n,st])=>{const num=Number(n),locked=num>unlocked,active=num===current;const completed=num<unlocked || (num===4 && solvedAt(pattern,4).length>0);const progress=num<4?`${ladderProgress(pattern,num)}/2`:completed?'✓':'final';return `<button class="ladder-step ladder-tab ${active?'current':''} ${locked?'locked':''}" data-stage="${num}" ${locked?'disabled':''}><span class="ladder-icon">${st.icon}</span><span><b>${num}. ${st.title}</b><small>${st.short}</small></span><em>${completed?'✓':progress}</em></button>`;}).join('')}</div>`;
}

function renderQuestionFormula(qn){
  const thing=qn.dimension==='None'?'Fact table':qn.dimension;
  return `<div class="formula-strip"><div><small>THING / DIMENSION</small><strong>${escapeHtml(thing)}</strong></div><span>+</span><div><small>METRIC</small><strong>${escapeHtml(qn.metric)}</strong></div><span>+</span><div><small>FILTER</small><strong>${escapeHtml(qn.filters)}</strong></div><span>→</span><div><small>RESULT</small><strong>${escapeHtml(qn.sort)} · ${escapeHtml(qn.limit)}</strong></div></div>`;
}

function renderStageCoach(stage,qn){
  if(stage===1) return `<p class="coach-copy">Do not write SQL yet. Drag the complete SQL lines into the order SQL normally follows.</p><div class="pattern-chain"><span>SELECT</span><b>→</b><span>FROM</span><b>→</b><span>JOIN</span><b>→</b><span>WHERE</span><b>→</b><span>GROUP BY</span><b>→</b><span>ORDER BY</span><b>→</b><span>LIMIT</span></div><small class="muted-note">A query may skip some steps when they are not needed.</small>`;
  if(stage===2) return `<p class="coach-copy">Now the lines are broken into smaller SQL pieces. Put the keyword next to the piece that belongs to it.</p><div class="remember"><strong>Relationship:</strong> JOIN table → ON key = key.</div>`;
  if(stage===3) return `<p class="coach-copy">The structure is already visible. Use the word bank to recall the missing metric, table, filter, sort, or limit.</p><div class="remember"><strong>Goal:</strong> recognize what changes when the business question changes.</div>`;
  return `<p class="coach-copy">Now answer exactly like the midterm: business question first, blank SQL editor second.</p>${renderDecoder(qn,true)}`;
}

function renderPracticeStageWorkspace(qn,stage){
  if(stage===1 || stage===2) return renderBoardPuzzle(qn,stage);
  if(stage===3) return renderFillPuzzle(qn);
  return renderTypePractice(qn);
}

function ensurePuzzleState(qn,stage){
  if(puzzleState && puzzleState.questionId===qn.id && puzzleState.stage===stage) return puzzleState;
  if(stage===1){
    const blocks=sqlClauseBlocks(qn.sql);
    const expected=blocks.map(x=>x.id);
    puzzleState={questionId:qn.id,stage,blocks,expected,board:Array(blocks.length).fill(null),tray:forceShuffled([...expected]),correct:false,liveResult:null};
  } else if(stage===2){
    const blocks=sqlSemanticBlocks(qn.sql);
    const expected=blocks.map(x=>x.id);
    puzzleState={questionId:qn.id,stage,blocks,expected,board:Array(blocks.length).fill(null),tray:forceShuffled([...expected]),correct:false,liveResult:null};
  } else if(stage===3){
    const fill=buildFillPuzzle(qn);
    puzzleState={questionId:qn.id,stage,...fill,correct:false,liveResult:null};
  } else puzzleState=null;
  return puzzleState;
}

function renderBoardPuzzle(qn,stage){
  const ps=ensurePuzzleState(qn,stage);
  const isBlocks=stage===2;
  const title=isBlocks?'Build the query from smaller blocks':'Snap the SQL clauses in order';
  const sub=isBlocks?'Keywords, tables, conditions & math are separated. Tap or drag to place.':'Start with SELECT. Tap any piece to snap onto the board, or drag into a slot.';
  const placedCount=ps.board.filter(x=>x!==null).length;

  return `
    <div class="card editor-card puzzle-card">
      <div class="editor-toolbar">
        <div>
          <strong>${title}</strong>
          <small class="toolbar-sub">${sub}</small>
        </div>
        <span class="pill">${ladderProgress(qn.pattern,stage)}/2 to unlock next step</span>
      </div>

      <div class="puzzle-workspace">
        <!-- Construction Board (Drop Slots) -->
        <div>
          <div style="font-size:11px; font-weight:800; color:var(--muted); letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">
            Construction Board (${placedCount} / ${ps.expected.length} Placed)
          </div>
          <div class="puzzle-drop-board" id="puzzleBoard">
            ${ps.board.map((blockId,idx)=>{
              const block=blockId?ps.blocks.find(b=>b.id===blockId):null;
              return `
                <div class="puzzle-slot ${block?'slot-filled':'slot-empty'}" data-slot="${idx}">
                  <span class="puzzle-slot-index">${idx+1}</span>
                  ${block?renderPuzzlePiece(block,idx,stage):`<span class="slot-placeholder">Slot ${idx+1}: Tap or drop piece here</span>`}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Available Pieces Tray -->
        <div class="puzzle-tray-section">
          <div class="puzzle-tray-header">
            <strong>Available Pieces (${ps.tray.length} remaining)</strong>
            <small style="color:var(--muted)">Tap piece to snap to board · Drag to slot</small>
          </div>
          <div class="puzzle-tray-pieces" id="puzzleTray">
            ${ps.tray.length?ps.tray.map(blockId=>{
              const block=ps.blocks.find(b=>b.id===blockId);
              return renderPuzzlePiece(block,-1,stage);
            }).join(''):`<div class="puzzle-tray-empty">✨ All pieces are on the board! Click "Check Query" below to run.</div>`}
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn" id="checkPuzzleBtn">Check Query</button>
        <button class="btn secondary" id="clearBoardBtn">Clear Board</button>
        <button class="btn ghost" id="resetPuzzleBtn">Shuffle Pieces</button>
      </div>

      <div id="practiceFeedback" class="feedback ${ps.correct?'show good':''}">${ps.correct?successMessage(qn,stage):''}</div>

      <!-- Live Database Query Results -->
      <div id="puzzleLiveResults">
        ${ps.liveResult?renderLiveResultBox(ps.liveResult,qn):''}
      </div>

      ${ps.correct?renderAfterPuzzle(qn,stage):''}
    </div>
  `;
}

function renderPuzzlePiece(block,slotIdx,stage){
  const clause=block.clause||block.label||'SELECT';
  const isPlaced=slotIdx>=0;
  return `
    <div class="puzzle-piece ${stage===2?'token-block':''}" draggable="true" data-id="${block.id}" data-clause="${escapeHtml(clause)}" data-slot="${slotIdx}">
      <span class="drag-handle" title="Drag">⋮⋮</span>
      <span class="puzzle-piece-badge">${escapeHtml(clause)}</span>
      <code>${escapeHtml(block.text)}</code>
      ${isPlaced?`<button type="button" class="piece-return-btn" data-return-id="${block.id}" title="Return to tray">✕</button>`:''}
    </div>
  `;
}

function renderFillPuzzle(qn){
  const ps=ensurePuzzleState(qn,3);
  const pieces=ps.template.split(/@@(\d+)@@/g);
  let codeHtml='';
  for(let i=0;i<pieces.length;i++){
    if(i%2===0){
      codeHtml+=escapeHtml(pieces[i]);
    } else {
      const idx=Number(pieces[i]);
      const val=ps.slots?ps.slots[idx]:null;
      if(val){
        codeHtml+=`<span class="cloze-drop-slot filled" data-slot="${idx}"><code>${escapeHtml(val)}</code> <button type="button" class="piece-return-btn" data-return-cloze="${idx}" style="margin-left:4px; font-size:11px" title="Remove chip">✕</button></span>`;
      } else {
        codeHtml+=`<span class="cloze-drop-slot slot-empty" data-slot="${idx}">[ drop or tap chip ]</span>`;
      }
    }
  }

  const bankChips=ps.bank.map((answer,i)=>{
    const isUsed=ps.slots&&ps.slots.includes(answer);
    return `
      <button type="button" class="word-chip-interactive ${isUsed?'used':''}" draggable="${!isUsed}" data-answer="${escapeHtml(answer)}" data-idx="${i}">
        <span>${escapeHtml(answer)}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="card editor-card puzzle-card">
      <div class="editor-toolbar">
        <div>
          <strong>Fill the missing SQL pieces</strong>
          <small class="toolbar-sub">Tap or drag word chips into the glowing empty slots.</small>
        </div>
        <span class="pill">${ladderProgress(qn.pattern,3)}/2 to unlock typing</span>
      </div>

      <div class="puzzle-workspace">
        <div class="word-bank">
          <small>WORD BANK (TAP OR DRAG CHIPS)</small>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">${bankChips}</div>
        </div>

        <div class="cloze-interactive-board">
          ${codeHtml}
        </div>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn" id="checkFillBtn">Check Gaps</button>
        <button class="btn secondary" id="resetPuzzleBtn">Reset Gaps</button>
      </div>

      <div id="practiceFeedback" class="feedback ${ps.correct?'show good':''}">${ps.correct?successMessage(qn,3):''}</div>

      <!-- Live Database Query Results -->
      <div id="puzzleLiveResults">
        ${ps.liveResult?renderLiveResultBox(ps.liveResult,qn):''}
      </div>

      ${ps.correct?renderAfterPuzzle(qn,3):''}
    </div>
  `;
}

function renderLiveResultBox(result,qn){
  if(!result||!result.rows)return '';
  const rows=result.rows;
  const cols=rows.length?Object.keys(rows[0]):[];
  return `
    <div class="puzzle-live-results">
      <div class="puzzle-live-results-header">
        <div class="puzzle-live-badge">
          <span class="pulse-dot"></span>
          <span>⚡ Live Query Output (${rows.length} record${rows.length===1?'':'s'} from NexaCart)</span>
        </div>
        <span class="pill" style="border-color:var(--accent-2); color:var(--accent-2); font-weight:700">✓ Real Database Result</span>
      </div>
      <div class="results-wrap" style="margin: 0; border: none; border-radius: 0; max-height: 260px;">
        <table class="result-table">
          <thead>
            <tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.slice(0,15).map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(displayValue(r[c]))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${rows.length>15?`<div style="padding: 6px 12px; font-size: 11px; color:#7484aa; background:#070b16;">Showing first 15 of ${rows.length} rows.</div>`:''}
    </div>
  `;
}

function renderTypePractice(qn){
  return `<div class="card editor-card"><div class="editor-toolbar"><strong>SQL editor — type from scratch</strong><small>Ctrl/Cmd + Enter to run</small></div><textarea id="practiceEditor" class="sql-editor" spellcheck="false" placeholder="Write your SELECT query here…"></textarea><div class="actions" style="margin-top:10px"><button class="btn" id="runPracticeBtn">Run & check</button><button class="btn secondary" id="runOnlyBtn">Run only</button><button class="btn ghost" id="clearEditorBtn">Clear</button></div><div id="practiceFeedback" class="feedback"></div><div id="practiceResults"></div></div>`;
}

function renderAfterPuzzle(qn,stage){
  const next=stage+1;
  const canNext=next<=unlockedStage(qn.pattern);
  return `<div class="puzzle-next"><div><strong>${canNext?`Stage ${next} unlocked!`:'Great job! Solve one more different question to unlock the next step.'}</strong><small>${canNext?LADDER_STAGES[next].short:'Use “Another question” to practice recognizing the pattern across different business questions.'}</small></div><div class="actions">${canNext?`<button class="btn" id="continueStageBtn">Continue to ${escapeHtml(LADDER_STAGES[next].title)}</button>`:''}<button class="btn secondary" id="anotherPuzzleBtn">Another question</button></div></div>`;
}

function successMessage(qn,stage){return `🎉 Pattern recognized! ${LADDER_STAGES[stage].title} completed for this question.`;}

function bindPracticeStageInteractions(){
  if(practiceStage===4){
    $('#runPracticeBtn').onclick=()=>checkPractice(true);
    $('#runOnlyBtn').onclick=()=>checkPractice(false);
    $('#clearEditorBtn').onclick=()=>$('#practiceEditor').value='';
    $('#practiceEditor').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();checkPractice(true);}});
    bindHintButtons();
    return;
  }
  if(practiceStage===1 || practiceStage===2){
    bindBoardPuzzleInteractions();
  } else if(practiceStage===3){
    bindClozeInteractions();
  }

  if($('#resetPuzzleBtn')) {
    $('#resetPuzzleBtn').onclick=()=>{
      puzzleState=null;
      practiceSolved=false;
      playClick();
      renderPractice();
    };
  }
  if($('#clearBoardBtn')) {
    $('#clearBoardBtn').onclick=()=>{
      if(puzzleState && puzzleState.board) {
        puzzleState.tray=forceShuffled([...puzzleState.expected]);
        puzzleState.board=Array(puzzleState.expected.length).fill(null);
        playClick();
        renderPractice();
      }
    };
  }
  if($('#continueStageBtn')) {
    $('#continueStageBtn').onclick=()=>{
      practiceStage=Math.min(4,practiceStage+1);
      currentQuestion=pickQuestion(currentQuestion.pattern,null,practiceStage);
      puzzleState=null;
      resetPracticeSession();
      playClick();
      renderPractice();
    };
  }
  if($('#anotherPuzzleBtn')) {
    $('#anotherPuzzleBtn').onclick=()=>{
      currentQuestion=pickQuestion(currentQuestion.pattern,currentQuestion.id,practiceStage);
      puzzleState=null;
      resetPracticeSession();
      playClick();
      renderPractice();
    };
  }
}

function bindBoardPuzzleInteractions(){
  const ps=puzzleState;
  if(!ps) return;

  // 1. Tap piece in tray -> moves to first empty slot on board
  $$('#puzzleTray .puzzle-piece').forEach(piece=>{
    piece.addEventListener('click',()=>{
      const pieceId=piece.dataset.id;
      const emptyIdx=ps.board.indexOf(null);
      if(emptyIdx!==-1){
        ps.board[emptyIdx]=pieceId;
        ps.tray=ps.tray.filter(id=>id!==pieceId);
        playSnap();
        renderPractice();
      } else {
        toast('Board is full! Rearrange pieces or click Check Query.');
        playError();
      }
    });
  });

  // 2. Tap return button (✕) on placed piece -> moves back to tray
  $$('#puzzleBoard .piece-return-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const returnId=btn.dataset.returnId;
      const slotIdx=ps.board.indexOf(returnId);
      if(slotIdx!==-1){
        ps.board[slotIdx]=null;
        if(!ps.tray.includes(returnId)) ps.tray.push(returnId);
        playClick();
        renderPractice();
      }
    });
  });

  // 3. Drag and drop onto slots
  $$('#puzzleBoard .puzzle-slot').forEach(slot=>{
    const slotIdx=Number(slot.dataset.slot);

    slot.addEventListener('dragover',e=>{
      e.preventDefault();
      slot.classList.add('drag-target-active');
    });

    slot.addEventListener('dragleave',()=>{
      slot.classList.remove('drag-target-active');
    });

    slot.addEventListener('drop',e=>{
      e.preventDefault();
      slot.classList.remove('drag-target-active');
      const pieceId=e.dataTransfer.getData('text/plain');
      if(!pieceId) return;

      const existingSlotIdx=ps.board.indexOf(pieceId);
      const targetSlotHasPiece=ps.board[slotIdx];

      if(existingSlotIdx!==-1){
        ps.board[existingSlotIdx]=targetSlotHasPiece;
        ps.board[slotIdx]=pieceId;
      } else {
        ps.tray=ps.tray.filter(id=>id!==pieceId);
        if(targetSlotHasPiece){
          ps.tray.push(targetSlotHasPiece);
        }
        ps.board[slotIdx]=pieceId;
      }

      playSnap();
      renderPractice();
    });
  });

  // 4. Drag and drop back to tray
  const tray=$('#puzzleTray');
  if(tray){
    tray.addEventListener('dragover',e=>e.preventDefault());
    tray.addEventListener('drop',e=>{
      e.preventDefault();
      const pieceId=e.dataTransfer.getData('text/plain');
      if(!pieceId) return;
      const slotIdx=ps.board.indexOf(pieceId);
      if(slotIdx!==-1){
        ps.board[slotIdx]=null;
        if(!ps.tray.includes(pieceId)) ps.tray.push(pieceId);
        playClick();
        renderPractice();
      }
    });
  }

  // 5. Drag start handlers on pieces
  $$('.puzzle-piece').forEach(piece=>{
    piece.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain',piece.dataset.id);
      piece.classList.add('dragging');
    });
    piece.addEventListener('dragend',()=>{
      piece.classList.remove('dragging');
    });
  });

  // 6. Check Query Button
  const checkBtn=$('#checkPuzzleBtn');
  if(checkBtn){
    checkBtn.onclick=checkBoardPuzzle;
  }
}

async function checkBoardPuzzle(){
  const ps=puzzleState;
  if(!ps) return;

  if(ps.board.includes(null)){
    showFeedback('bad','Place all pieces onto the board first! Tap or drag each piece into a slot.');
    playError();
    return;
  }

  const ok=ps.board.every((id,idx)=>id===ps.expected[idx]);
  if(ok){
    await completePuzzleStage(currentQuestion,practiceStage);
  } else {
    const firstWrong=ps.board.findIndex((id,idx)=>id!==ps.expected[idx]);
    const expectedBlock=ps.blocks.find(x=>x.id===ps.expected[firstWrong]);
    const clue=practiceStage===1
      ?`Slot ${firstWrong+1} should start with ${escapeHtml(expectedBlock.label||expectedBlock.clause)}. Remember SQL sequence: SELECT ➔ FROM ➔ JOIN ➔ WHERE ➔ GROUP BY ➔ ORDER BY ➔ LIMIT.`
      :`Slot ${firstWrong+1} is out of order. Keep SQL keywords paired with the table, condition, or calculation they introduce.`;
    showFeedback('bad',`Not quite right. ${clue}`);
    playError();
  }
}

function bindClozeInteractions(){
  const ps=puzzleState;
  if(!ps) return;

  // 1. Tap word chip in bank -> snaps into first empty slot
  $$('.word-chip-interactive:not(.used)').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const answer=chip.dataset.answer;
      const emptyIdx=ps.slots.findIndex(x=>!x);
      if(emptyIdx!==-1){
        ps.slots[emptyIdx]=answer;
        playSnap();
        renderPractice();
      } else {
        toast('All gap slots are filled! Click Check Gaps.');
        playError();
      }
    });

    chip.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain',chip.dataset.answer);
    });
  });

  // 2. Tap return button (✕) in filled slot -> clears slot
  $$('.cloze-drop-slot .piece-return-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const slotIdx=Number(btn.dataset.returnCloze);
      ps.slots[slotIdx]=null;
      playClick();
      renderPractice();
    });
  });

  // 3. Drag over and drop onto cloze slots
  $$('.cloze-drop-slot').forEach(slot=>{
    const slotIdx=Number(slot.dataset.slot);

    slot.addEventListener('dragover',e=>{
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave',()=>{
      slot.classList.remove('drag-over');
    });
    slot.addEventListener('drop',e=>{
      e.preventDefault();
      slot.classList.remove('drag-over');
      const answer=e.dataTransfer.getData('text/plain');
      if(!answer) return;
      ps.slots[slotIdx]=answer;
      playSnap();
      renderPractice();
    });
  });

  // 4. Check Fill Button
  const checkBtn=$('#checkFillBtn');
  if(checkBtn){
    checkBtn.onclick=checkClozePuzzle;
  }
}

async function checkClozePuzzle(){
  const ps=puzzleState;
  if(!ps) return;

  if(ps.slots.some(x=>!x)){
    showFeedback('bad','Fill all the gap slots first! Tap or drag chips from the word bank.');
    playError();
    return;
  }

  let ok=true;
  $$('.cloze-drop-slot').forEach(slot=>{
    const idx=Number(slot.dataset.slot);
    const val=ps.slots[idx];
    const isGood=normalizeGap(val)===normalizeGap(ps.answers[idx]);
    slot.classList.toggle('wrong',!isGood);
    slot.classList.toggle('right',isGood);
    if(!isGood) ok=false;
  });

  if(ok){
    await completePuzzleStage(currentQuestion,3);
  } else {
    showFeedback('bad','Almost there! Check the highlighted red gaps. Ask yourself: is it the metric, table, filter, or limit?');
    playError();
  }
}

function normalizeGap(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ').replace(/;$/,'');}

async function completePuzzleStage(qn,stage){
  const arr=state.ladder[qn.pattern][String(stage)];
  const first=!arr.includes(qn.id);
  const isUnlock=first && arr.length===1;

  if(first){
    arr.push(qn.id);
    const xp={1:10,2:12,3:15}[stage]||8;
    const mastery={1:4,2:5,3:6}[stage]||3;
    state.xp+=xp;
    state.patternScores[qn.pattern]=Math.min(100,(state.patternScores[qn.pattern]||0)+mastery);
    state.recent.unshift({id:qn.id,prompt:`${qn.prompt} · ${LADDER_STAGES[stage].title}`,correct:true,at:new Date().toISOString()});
    state.recent=state.recent.slice(0,20);
    updateStreak(true);
    saveProgress();
    toast(`🎉 Pattern recognized! +${xp} XP`);
  }

  practiceSolved=true;
  if(puzzleState) puzzleState.correct=true;

  // Execute live query against PostgreSQL database!
  try {
    const liveRes=await db.query(qn.sql);
    if(puzzleState) puzzleState.liveResult=liveRes;
  } catch(err){
    console.error('Error executing query for live result:',err);
  }

  // Celebrations
  if(isUnlock){
    playFanfare();
  } else {
    playSuccess();
  }
  launchConfetti();

  renderPractice();
}

function sqlClauseBlocks(sql){
  const clean=stripTrailingSemicolon(sql).replace(/\s+/g,' ').trim();
  const re=/\b(SELECT|FROM|JOIN|WHERE|GROUP BY|ORDER BY|LIMIT)\b/gi;
  const matches=[...clean.matchAll(re)];
  return matches.map((m,i)=>{
    const text=clean.slice(m.index,i+1<matches.length?matches[i+1].index:clean.length).trim();
    const label=m[1].toUpperCase();
    return {id:`clause-${i}`,label,clause:label,text:prettyClause(text,label)};
  });
}

function prettyClause(text,label){
  if(label==='JOIN') return text.replace(/\s+ON\s+/i,'\n  ON ');
  if(label==='WHERE') return text.replace(/\s+AND\s+/gi,'\n  AND ');
  return text;
}

function sqlSemanticBlocks(sql){
  const clauses=sqlClauseBlocks(sql); const out=[]; let n=0;
  const push=(text,label='',clause='SELECT')=>out.push({id:`token-${n++}`,text,label,clause});
  for(const c of clauses){
    const one=c.text.replace(/\s+/g,' ').trim();
    if(c.label==='JOIN'){
      const m=one.match(/^JOIN\s+(.+?)\s+ON\s+(.+)$/i);
      if(m){push('JOIN','JOIN','JOIN');push(m[1],'table','JOIN');push('ON','ON','JOIN');push(m[2],'condition','JOIN');continue;}
    }
    if(c.label==='WHERE'){
      const rest=one.replace(/^WHERE\s+/i,''); const conditions=rest.split(/\s+AND\s+/i);
      push('WHERE','WHERE','WHERE'); conditions.forEach((x,i)=>{if(i)push('AND','AND','WHERE');push(x,'condition','WHERE');}); continue;
    }
    const kw=c.label; const rest=one.slice(kw.length).trim(); push(kw,kw,kw); if(rest)push(rest,'content',kw);
  }
  return out;
}

function buildFillPuzzle(qn){
  let template=sqlClauseBlocks(qn.sql).map(x=>x.text).join('\n');
  const candidates=[];
  const add=(needle,answer=needle)=>{if(needle && !candidates.some(x=>x.needle.toLowerCase()===needle.toLowerCase()) && template.toLowerCase().includes(needle.toLowerCase()))candidates.push({needle,answer});};
  const metricFields=['net_sales','quantity','total_paid','discount_amount','order_number','customer_id'];
  for(const field of metricFields) if(template.toLowerCase().includes(field)) {add(field);break;}
  for(const fn of ['COUNT','SUM','AVG']) if(new RegExp(`\\b${fn}\\b`,'i').test(template)){add(fn);break;}
  add('fact_order_items');
  const joins=[...template.matchAll(/JOIN\s+(dim_\w+)/gi)].map(m=>m[1]);
  joins.slice(0,2).forEach(x=>add(x));
  const literal=template.match(/'([^']+)'/); if(literal)add(`'${literal[1]}'`,`'${literal[1]}'`);
  const year=template.match(/=\s*(20\d{2})/); if(year)add(year[1]);
  if(/\bDESC\b/i.test(template)) add('DESC');
  const lim=template.match(/\bLIMIT\s+(\d+)/i); if(lim)add(lim[1]);
  for(const kw of ['SELECT','FROM','GROUP BY','ORDER BY','WHERE','JOIN']) if(candidates.length<5 && new RegExp(`\\b${kw.replace(' ','\\s+')}\\b`,'i').test(template)) add(kw);
  const chosen=candidates.slice(0,Math.min(5,Math.max(3,candidates.length)));
  const answers=[];
  chosen.forEach((c,i)=>{
    const idx=template.toLowerCase().indexOf(c.needle.toLowerCase());
    if(idx<0)return;
    template=template.slice(0,idx)+`@@${answers.length}@@`+template.slice(idx+c.needle.length);
    answers.push(c.answer);
  });
  return {template,answers,slots:Array(answers.length).fill(null),values:Array(answers.length).fill(''),bank:forceShuffled(answers)};
}

function forceShuffled(items){
  const out=shuffle(items);
  if(out.length>1 && out.every((x,i)=>x===items[i])) [out[0],out[1]]=[out[1],out[0]];
  return out;
}

function bindHintButtons(){
  $$('.hint-button').forEach(b=>b.onclick=()=>revealHint(Number(b.dataset.idx)));
  if($('#solutionBtn')) $('#solutionBtn').onclick=showSolution;
}
function refreshHints(){
  const area=$('#hintArea'); if(!area)return; area.innerHTML=renderHints();
  const count=$('#hintCount'); if(count) count.textContent=`${Math.min(practiceHints,3)}/3 used`;
  bindHintButtons();
}
function renderDecoder(qn,open=true){return `<div class="decoder"><div class="section-head"><div><h3>Decode before SQL</h3><p>Train your brain to translate the sentence.</p></div></div><div class="decoder-grid"><div class="decoder-item"><small>Metric</small><strong>${escapeHtml(qn.metric)}</strong></div><div class="decoder-item"><small>Dimension(s)</small><strong>${escapeHtml(qn.dimension)}</strong></div><div class="decoder-item"><small>Filter(s)</small><strong>${escapeHtml(qn.filters)}</strong></div><div class="decoder-item"><small>Sort / result count</small><strong>${escapeHtml(qn.sort)} · ${escapeHtml(qn.limit)}</strong></div></div></div>`;}
function renderHints(){return currentQuestion.hints.map((h,i)=> i<practiceHints ? `<div class="hint-card"><strong>Hint ${i+1}</strong><p>${escapeHtml(h)}</p></div>` : `<button class="btn ghost small hint-button" data-idx="${i+1}">Reveal hint ${i+1}</button>`).join('') + (practiceHints>=3?`<button class="btn danger small" id="solutionBtn">Show full solution</button>`:'');}
function revealHint(idx){if(idx!==practiceHints+1)return;practiceHints++;refreshHints();}
function showSolution(){practiceHints=4;$('#practiceEditor').value=formatSQL(currentQuestion.sql);refreshHints();showFeedback('info','Solution shown. Type it again yourself rather than only reading it.');}
function resetPracticeSession(){practiceAttempts=0;practiceHints=0;practiceSolved=false;}
async function checkPractice(grade){
  const editor=$('#practiceEditor'); const sql=editor.value.trim(); if(!sql){showFeedback('bad','Write a query first.');return;}
  if(!isSafeSelect(sql)){showFeedback('bad','Practice mode only allows SELECT / WITH queries. Do not modify the database.');return;}
  practiceAttempts++;
  try {
    const user=await db.query(stripTrailingSemicolon(sql)); renderResults('#practiceResults',user);
    if(!grade){showFeedback('info','Query ran successfully. Use “Run & check” when you want it graded.');return;}
    const expected=await db.query(currentQuestion.sql);
    const ok=compareResults(user,expected);
    recordAttempt(currentQuestion,ok);
    if(ok){
      practiceSolved=true;
      const firstStageSolve=!state.ladder[currentQuestion.pattern]['4'].includes(currentQuestion.id);
      if(firstStageSolve) state.ladder[currentQuestion.pattern]['4'].push(currentQuestion.id);
      const xp=practiceHints===0&&practiceAttempts===1?20:practiceHints===0?14:practiceHints<=2?10:5;
      state.xp+=xp;
      const add=practiceHints===0&&practiceAttempts===1?12:practiceHints<=1?8:practiceHints<=3?6:3;
      state.patternScores[currentQuestion.pattern]=Math.min(100,(state.patternScores[currentQuestion.pattern]||0)+add);
      updateStreak(true); saveProgress();
      showFeedback('good',`Correct from scratch. +${xp} XP · ${PATTERNS[currentQuestion.pattern].title} mastery is now ${state.patternScores[currentQuestion.pattern]}%.`);
    } else {
      state.patternScores[currentQuestion.pattern]=Math.max(0,(state.patternScores[currentQuestion.pattern]||0)-1);saveProgress();showFeedback('bad','The query runs, but the result does not match the business question yet. Compare your metric, filter, grouping, sorting, and limit.');
    }
  } catch(err){recordAttempt(currentQuestion,false);showFeedback('bad',`SQL error: ${err.message || err}`);}
}
function recordAttempt(qn,correct){const s=state.questionStats[qn.id]||{attempts:0,correct:false};s.attempts++;s.correct=s.correct||correct;s.last=Date.now();state.questionStats[qn.id]=s;state.recent.unshift({id:qn.id,prompt:qn.prompt,correct,at:new Date().toISOString()});state.recent=state.recent.slice(0,20);saveProgress();}
function showFeedback(type,msg){const el=$('#practiceFeedback');if(!el)return;el.className=`feedback show ${type}`;el.innerHTML=msg;}
function pickQuestion(pattern,exclude,stage=practiceStage){
  const pool=QUESTIONS.filter(x=>x.pattern===pattern&&x.id!==exclude);
  let unsolved;
  if(stage<4){const done=solvedAt(pattern,stage);unsolved=pool.filter(x=>!done.includes(x.id));}
  else unsolved=pool.filter(x=>!state.questionStats[x.id]?.correct);
  const arr=unsolved.length?unsolved:pool;
  return arr[Math.floor(Math.random()*arr.length)];
}
function startQuickPractice(){practiceMode=weakestPattern();practiceStage=unlockedStage(practiceMode);currentQuestion=pickQuestion(practiceMode,null,practiceStage);puzzleState=null;resetPracticeSession();navigate('practice');toast(`Starting with ${LADDER_STAGES[practiceStage].title}: ${PATTERNS[practiceMode].title}.`);}

function renderMock(){
  if(mock?.active){renderMockActive();return;}
  const best=state.mockHistory.length?Math.max(...state.mockHistory.map(x=>x.score)):null;
  const avg=state.mockHistory.length?Math.round(state.mockHistory.reduce((s,x)=>s+x.score,0)/state.mockHistory.length*10)/10:null;
  $('#page-mock').innerHTML=`<div class="card mock-start"><div class="eyebrow">SIMULATE THE PRACTICAL MIDTERM</div><h2>10 business questions · 20 minutes · no hints</h2><p style="color:var(--muted);line-height:1.7">You may run your SQL and inspect the result, just like using Supabase. The site will not tell you whether an answer is correct until the end. The exam covers the same six patterns you practiced.</p><div class="grid-3" style="margin:20px 0">${statCard('Attempts',state.mockHistory.length,'Completed mock exams')}${statCard('Best',best===null?'—':best+'/10','Highest score')}${statCard('Average',avg===null?'—':avg+'/10','Across all attempts')}</div><div class="actions"><button class="btn" id="startMockBtn">Start mock midterm</button></div></div>${state.mockHistory.length?`<div class="section card"><h3>Recent mock scores</h3>${state.mockHistory.slice(-5).reverse().map(x=>`<div class="metric-row"><span>${new Date(x.date).toLocaleString()}</span><code>${x.score}/10</code></div>`).join('')}</div>`:''}`;
  $('#startMockBtn').onclick=startMock;
}
function startMock(){
  const picks=[]; for(const pid of Object.keys(PATTERNS)){const pool=QUESTIONS.filter(q=>q.pattern===pid);picks.push(...shuffle(pool).slice(0,pid==='mixed'||pid==='topn'||pid==='trend'||pid==='place'?2:1));}
  const qs=shuffle(picks).slice(0,10);
  mock={active:true,index:0,questions:qs,answers:Array(qs.length).fill(null),submitted:Array(qs.length).fill(false),started:Date.now(),seconds:20*60,ended:false};
  clearInterval(mockTimerHandle); mockTimerHandle=setInterval(()=>{if(!mock?.active)return;mock.seconds--;updateMockTimer();if(mock.seconds<=0)finishMock();},1000); renderMockActive();
}
function renderMockActive(){
  const qn=mock.questions[mock.index];
  $('#page-mock').innerHTML=`<div class="mock-shell"><div><div class="card question-card"><div class="question-type">QUESTION ${mock.index+1} OF ${mock.questions.length}</div><h3>${escapeHtml(qn.prompt)}</h3><div class="question-meta"><span class="pill">No hints</span><span class="pill">${PATTERNS[qn.pattern].title}</span></div></div><div class="card editor-card"><div class="editor-toolbar"><strong>Your SQL</strong><small>Run as often as you need</small></div><textarea id="mockEditor" class="sql-editor" spellcheck="false">${escapeHtml(mock.answers[mock.index]?.sql||'')}</textarea><div class="actions" style="margin-top:10px"><button class="btn secondary" id="mockRunBtn">Run query</button><button class="btn" id="mockSubmitBtn">Submit answer</button></div><div id="mockFeedback" class="feedback"></div><div id="mockResults"></div></div></div><aside class="card mock-side"><div class="eyebrow">TIME LEFT</div><div id="mockTimer" class="timer">${fmtTime(mock.seconds)}</div><div class="question-dots">${mock.questions.map((_,i)=>`<div class="question-dot ${i===mock.index?'current':''} ${mock.submitted[i]?'done':''}">${i+1}</div>`).join('')}</div><div class="actions" style="margin-top:16px"><button class="btn ghost small" id="mockPrevBtn" ${mock.index===0?'disabled':''}>Previous</button><button class="btn ghost small" id="mockNextBtn" ${mock.index===mock.questions.length-1?'disabled':''}>Next</button></div><button class="btn danger small" id="finishMockBtn" style="margin-top:12px;width:100%">Finish exam</button></aside></div>`;
  $('#mockRunBtn').onclick=()=>runMock(false); $('#mockSubmitBtn').onclick=()=>runMock(true); $('#mockPrevBtn').onclick=()=>saveMockDraftAndMove(-1); $('#mockNextBtn').onclick=()=>saveMockDraftAndMove(1); $('#finishMockBtn').onclick=()=>confirmFinishMock(); $('#mockEditor').addEventListener('input',()=>{mock.answers[mock.index]={...(mock.answers[mock.index]||{}),sql:$('#mockEditor').value};}); updateMockTimer();
}
async function runMock(submit){const sql=$('#mockEditor').value.trim();if(!sql){mockFeedback('bad','Write a query first.');return;}if(!isSafeSelect(sql)){mockFeedback('bad','Only SELECT / WITH queries are allowed.');return;}try{const user=await db.query(stripTrailingSemicolon(sql));renderResults('#mockResults',user);if(submit){const expected=await db.query(mock.questions[mock.index].sql);const correct=compareResults(user,expected);mock.answers[mock.index]={sql,correct};mock.submitted[mock.index]=true;toast('Answer submitted. Correctness will be shown after the exam.');if(mock.index<mock.questions.length-1)mock.index++;renderMockActive();}}catch(err){mockFeedback('bad',`SQL error: ${err.message||err}`);}}
function mockFeedback(type,msg){const el=$('#mockFeedback');if(!el)return;el.className=`feedback show ${type}`;el.textContent=msg;}
function saveMockDraftAndMove(delta){mock.answers[mock.index]={...(mock.answers[mock.index]||{}),sql:$('#mockEditor')?.value||mock.answers[mock.index]?.sql||''};mock.index=Math.max(0,Math.min(mock.questions.length-1,mock.index+delta));renderMockActive();}
function updateMockTimer(){const el=$('#mockTimer');if(el){el.textContent=fmtTime(mock.seconds);el.classList.toggle('low',mock.seconds<180);}}
function fmtTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.max(0,s%60)).padStart(2,'0')}`;}
function confirmFinishMock(){showModal('Finish mock midterm?','Unsubmitted questions will count as incorrect.',[{label:'Keep working',cls:'secondary'},{label:'Finish exam',cls:'danger',action:finishMock}]);}
function finishMock(){if(!mock?.active)return;clearInterval(mockTimerHandle);const score=mock.answers.filter(x=>x?.correct).length;const result={score,date:new Date().toISOString(),questions:mock.questions.map((q,i)=>({id:q.id,prompt:q.prompt,correct:!!mock.answers[i]?.correct,sql:mock.answers[i]?.sql||'',solution:q.sql}))};state.mockHistory.push(result);state.xp+=score*8;Object.keys(PATTERNS).forEach(pid=>{const qs=result.questions.filter(x=>QUESTIONS.find(q=>q.id===x.id)?.pattern===pid);const good=qs.filter(x=>x.correct).length;if(qs.length)state.patternScores[pid]=Math.min(100,Math.max(0,(state.patternScores[pid]||0)+good*3-(qs.length-good)));});updateStreak(true);saveProgress();mock={active:false,lastResult:result};renderMockResult(result);}
function renderMockResult(result){$('#page-mock').innerHTML=`<div class="hero"><div class="eyebrow">MOCK COMPLETE</div><h1>${result.score}/10</h1><p>${result.score>=8?'Strong result. Review the missed patterns, then try another mock later.':result.score>=6?'You are close. Review the questions you missed and practice those patterns.':'Use the review below to identify exactly which patterns need work.'}</p><div class="actions"><button class="btn" id="retryMockBtn">Start another mock</button><button class="btn secondary" id="homeAfterMockBtn">Back to home</button></div></div><div class="section card"><h3>Question review</h3><div class="mock-review">${result.questions.map((x,i)=>`<div class="review-item ${x.correct?'good':'bad'}"><strong>${x.correct?'✓':'✗'} ${i+1}. ${escapeHtml(x.prompt)}</strong>${!x.correct?`<details style="margin-top:8px"><summary>Show one correct solution</summary><div class="code-block" style="margin-top:8px">${escapeHtml(formatSQL(x.solution))}</div></details>`:''}</div>`).join('')}</div></div>`;$('#retryMockBtn').onclick=()=>{mock=null;startMock();};$('#homeAfterMockBtn').onclick=()=>{mock=null;navigate('home');};}

function renderCheat(){
  $('#page-cheatsheet').innerHTML=`<div class="hero"><div class="eyebrow">THE ONLY SHEET TO MEMORIZE FIRST</div><h1>Question → SQL</h1><p>Do not memorize thirty finished queries. Memorize the metric, the joins, and one skeleton.</p></div><div class="section cheat-grid"><div class="card"><h3>4 metrics to know</h3><div class="metric-list">${metricRowsMini()}</div></div><div class="card"><h3>Main query skeleton</h3><div class="code-block">SELECT\n  dimension,\n  calculation\nFROM fact_order_items f\nJOIN dimension_table d\n  ON f.dimension_id = d.dimension_id\nWHERE condition\nGROUP BY dimension\nORDER BY calculation DESC\nLIMIT 10;</div></div><div class="card"><h3>Joins</h3><div class="code-block">-- product\nJOIN dim_product p\n  ON f.product_id = p.product_id\n\n-- customer\nJOIN dim_customer c\n  ON f.customer_id = c.customer_id\n\n-- seller\nJOIN dim_seller s\n  ON f.seller_id = s.seller_id\n\n-- payment\nJOIN dim_payment pay\n  ON f.payment_id = pay.payment_id\n\n-- shipping\nJOIN dim_shipping sh\n  ON f.shipping_id = sh.shipping_id</div></div><div class="card"><h3>Date filters</h3><div class="code-block">-- year\nWHERE EXTRACT(YEAR FROM order_date) = 2026\n\n-- month\nWHERE EXTRACT(MONTH FROM order_date) = 8\n\n-- monthly grouping\nDATE_TRUNC('month', order_date)::DATE</div><div class="remember"><strong>Trend rule:</strong> ORDER BY month/year, not by sales.</div></div></div><div class="section card"><h3>Before you type, answer these five questions</h3><div class="grid-4"><div class="decoder-item"><small>1</small><strong>What thing?</strong><br><small>Product, category, customer, seller…</small></div><div class="decoder-item"><small>2</small><strong>What metric?</strong><br><small>Sales, orders, units, spending…</small></div><div class="decoder-item"><small>3</small><strong>What filters?</strong><br><small>City, year, category…</small></div><div class="decoder-item"><small>4–5</small><strong>How sorted? How many?</strong><br><small>DESC? Chronological? Top 10?</small></div></div></div>`;
}
function metricRowsMini(){return [['Sales','SUM(net_sales)'],['Orders','COUNT(DISTINCT order_number)'],['Units sold','SUM(quantity)'],['Customer spending','SUM(total_paid)']].map(x=>`<div class="metric-row"><span>${x[0]}</span><code>${x[1]}</code></div>`).join('');}

function renderSchema(){
  $('#page-schema').innerHTML=`<div class="grid-2"><div class="card"><h3>NexaCart star schema</h3><p class="schema-note">The fact table has 25,000 order-item rows representing 10,000 unique orders. The grain is <strong>one product line inside one order</strong>.</p><div class="schema-stage"><div class="schema-table customer"><h4>dim_customer</h4><ul><li class="key">customer_id PK</li><li>customer_name</li><li>city</li></ul></div><div class="schema-table product"><h4>dim_product</h4><ul><li class="key">product_id PK</li><li>product_name</li><li>category</li><li>brand</li></ul></div><div class="schema-table fact"><h4>fact_order_items</h4><ul><li class="key">order_item_id PK</li><li>order_number</li><li>order_date</li><li class="key">customer_id FK</li><li class="key">product_id FK</li><li class="key">seller_id FK</li><li class="key">payment_id FK</li><li class="key">shipping_id FK</li><li>quantity</li><li>unit_price</li><li>discount_amount</li><li>shipping_fee</li><li>gross_sales</li><li>net_sales</li><li>total_paid</li></ul></div><div class="schema-table seller"><h4>dim_seller</h4><ul><li class="key">seller_id PK</li><li>shop_name</li><li>seller_city</li></ul></div><div class="schema-table payment"><h4>dim_payment</h4><ul><li class="key">payment_id PK</li><li>payment_method</li></ul></div><div class="schema-table shipping"><h4>dim_shipping</h4><ul><li class="key">shipping_id PK</li><li>shipping_method</li><li>courier_name</li></ul></div></div></div><div><div class="card"><h3>Dataset facts</h3>${statCard('Customers','500','dimension records')}${statCard('Products','150','catalog products')}${statCard('Orders','10,000','COUNT(DISTINCT order_number)')}${statCard('Fact rows','25,000','COUNT(*)')}</div><div class="card" style="margin-top:16px"><h3>Why 25,000 rows but 10,000 orders?</h3><p class="schema-note">One order can contain several products. Each different product becomes its own fact row. Example: one order containing Earbuds + Charger + Cable = 1 unique order but 3 fact rows.</p><div class="code-block">COUNT(*)\n→ 25,000 order-item rows\n\nCOUNT(DISTINCT order_number)\n→ 10,000 unique orders\n\nSUM(quantity)\n→ physical units sold</div></div><div class="card" style="margin-top:16px"><h3>Database safety</h3><p class="schema-note">The training database is local to this browser. Practice only allows SELECT queries, so you cannot accidentally damage it.</p><button class="btn danger small" id="resetDbBtn">Rebuild local training database</button></div></div></div>`;
  $('#resetDbBtn').onclick=()=>showModal('Rebuild the local training database?','This resets only the practice database. Your learning progress remains saved.',[{label:'Cancel',cls:'secondary'},{label:'Rebuild database',cls:'danger',action:async()=>{localStorage.removeItem('unused');await seedDatabase();toast('Training database rebuilt.');}}]);
}

function renderResults(selector,result){const target=$(selector);if(!target)return;const rows=result.rows||[];if(!rows.length){target.innerHTML='<div class="empty-state">Query returned 0 rows.</div>';return;}const cols=Object.keys(rows[0]);target.innerHTML=`<div class="results-wrap"><table class="result-table"><thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,100).map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(displayValue(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length>100?`<small style="color:#7484aa">Showing first 100 of ${rows.length} rows.</small>`:''}`;}
function displayValue(v){if(v===null)return 'NULL';if(v instanceof Date)return v.toISOString().slice(0,10);return String(v);}
function normalizeResult(r){return (r.rows||[]).map(row=>Object.values(row).map(normalizeValue));}
function normalizeValue(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==='bigint')return Number(v);if(typeof v==='number')return Math.round(v*10000)/10000;if(typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)){const n=Number(v);if(Number.isFinite(n))return Math.round(n*10000)/10000;}return String(v);}
function compareResults(a,b){return JSON.stringify(normalizeResult(a))===JSON.stringify(normalizeResult(b));}
function isSafeSelect(sql){const s=sql.replace(/--.*$/gm,' ').replace(/\/\*[\s\S]*?\*\//g,' ').trim().toLowerCase();if(!(s.startsWith('select')||s.startsWith('with')))return false;const noStrings=s.replace(/'(?:''|[^'])*'/g,"''");return !/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|analyze)\b/.test(noStrings);}
function stripTrailingSemicolon(s){return s.trim().replace(/;+\s*$/,'');}
function formatSQL(sql){return sql.replace(/\s+(FROM|JOIN|WHERE|GROUP BY|ORDER BY|LIMIT)\s+/gi,'\n$1 ').replace(/\s+(AND)\s+/gi,'\n  $1 ').replace(/,\s*/g,',\n  ');}

function exportProgress(){const data={app:'NexaSQL Midterm Focus',version:5,exportedAt:new Date().toISOString(),progress:state};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nexasql-progress-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Progress backup downloaded.');}
async function importProgress(event){const file=event.target.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text());const p=obj.progress||obj;if(!p.patternScores||typeof p.xp!=='number')throw new Error('Not a NexaSQL progress backup.');showModal('Import this progress backup?',`XP: ${p.xp} · Readiness: ${Math.round(Object.values(p.patternScores).reduce((a,b)=>a+Number(b||0),0)/6)}%. Your current progress will be replaced.`,[{label:'Cancel',cls:'secondary'},{label:'Import',action:()=>{state={...defaultProgress(),...p,patternScores:{...defaultProgress().patternScores,...p.patternScores},ladder:normalizeLadder(p.ladder)};saveProgress();renderAll();toast('Progress restored.');}}]);}catch(err){toast('Could not import that file.');}finally{event.target.value='';}}
function confirmReset(){showModal('Reset all learning progress?','This resets XP, mastery, mock scores, and history. The training database is not affected.',[{label:'Cancel',cls:'secondary'},{label:'Reset progress',cls:'danger',action:()=>{state=defaultProgress();saveProgress();renderAll();toast('Learning progress reset.');}}]);}
function showModal(title,body,buttons){const root=$('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><div class="modal"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><div class="actions" id="modalActions"></div></div></div>`;buttons.forEach(b=>{const btn=document.createElement('button');btn.className=`btn ${b.cls||''}`;btn.textContent=b.label;btn.onclick=()=>{root.innerHTML='';if(b.action)b.action();};$('#modalActions').appendChild(btn);});$('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))root.innerHTML='';});}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500);}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ==========================================================================
   SQL FLASHCARDS: COMMON MIDTERM QUESTIONS & ACTIVE RECALL
   ========================================================================== */
const FLASHCARDS = [
  {
    id: 'fc-1',
    category: 'KPIs & Metrics',
    badge: 'TOTAL REVENUE',
    question: 'How do you calculate total net sales / revenue across all completed orders?',
    highlight: 'SUM(net_sales)',
    table: 'fact_order_items',
    examTip: 'Don’t use SUM(unit_price) or gross_sales unless asked for gross. Net sales already accounts for discounts and product quantities!',
    sql: `SELECT SUM(net_sales) AS total_revenue\nFROM fact_order_items;`
  },
  {
    id: 'fc-2',
    category: 'KPIs & Metrics',
    badge: 'TOTAL ORDERS',
    question: 'How do you count the total number of orders placed?',
    highlight: 'COUNT(DISTINCT order_number)',
    table: 'fact_order_items',
    examTip: '⚠️ In an order-items fact table, COUNT(*) counts rows/line-items (25,000), NOT unique orders (10,000)! Always use COUNT(DISTINCT order_number).',
    sql: `SELECT COUNT(DISTINCT order_number) AS total_orders\nFROM fact_order_items;`
  },
  {
    id: 'fc-3',
    category: 'KPIs & Metrics',
    badge: 'PHYSICAL QUANTITY',
    question: 'How do you calculate the total number of physical product units sold?',
    highlight: 'SUM(quantity)',
    table: 'fact_order_items',
    examTip: 'Quantity represents physical items shipped inside boxes. Never use COUNT(quantity) because COUNT only counts rows, not the pieces inside each row.',
    sql: `SELECT SUM(quantity) AS total_units_sold\nFROM fact_order_items;`
  },
  {
    id: 'fc-4',
    category: 'KPIs & Metrics',
    badge: 'AVERAGE ORDER VALUE',
    question: 'How do you find the Average Order Value (AOV)?',
    highlight: 'SUM(net_sales) / COUNT(DISTINCT order_number)',
    table: 'fact_order_items',
    examTip: 'AVG(net_sales) gives the average price per item line, NOT per order. Divide total revenue by distinct order count!',
    sql: `SELECT\n  ROUND(SUM(net_sales) / COUNT(DISTINCT order_number), 2) AS average_order_value\nFROM fact_order_items;`
  },
  {
    id: 'fc-5',
    category: 'Top-N & Joins',
    badge: 'BEST SELLERS',
    question: 'Which are the Top 5 products by net sales, and how much did each generate?',
    highlight: 'JOIN dim_product + GROUP BY + ORDER BY DESC + LIMIT 5',
    table: 'fact_order_items f JOIN dim_product p',
    examTip: 'Five steps: 1) SELECT name & SUM, 2) JOIN dim_product on product_id, 3) GROUP BY product_name, 4) ORDER BY sales DESC, 5) LIMIT 5.',
    sql: `SELECT\n  p.product_name,\n  SUM(f.net_sales) AS total_sales\nFROM fact_order_items f\nJOIN dim_product p\n  ON f.product_id = p.product_id\nGROUP BY p.product_name\nORDER BY total_sales DESC\nLIMIT 5;`
  },
  {
    id: 'fc-6',
    category: 'Top-N & Joins',
    badge: 'TOP CUSTOMERS',
    question: 'Who are the top 3 highest-spending customers in total payments?',
    highlight: 'JOIN dim_customer + SUM(total_paid) + LIMIT 3',
    table: 'fact_order_items f JOIN dim_customer c',
    examTip: 'Customer spending includes shipping fees and discounts, represented by total_paid in the fact table. Always group by customer_name and sort DESC.',
    sql: `SELECT\n  c.customer_name,\n  SUM(f.total_paid) AS total_spent\nFROM fact_order_items f\nJOIN dim_customer c\n  ON f.customer_id = c.customer_id\nGROUP BY c.customer_name\nORDER BY total_spent DESC\nLIMIT 3;`
  },
  {
    id: 'fc-7',
    category: 'Top-N & Joins',
    badge: 'CATEGORY RANKING',
    question: 'What are the sales figures for each product category, ranked from highest to lowest?',
    highlight: 'GROUP BY p.category ORDER BY sales DESC',
    table: 'fact_order_items f JOIN dim_product p',
    examTip: 'Every non-aggregated column appearing in SELECT (here, category) MUST be listed in GROUP BY.',
    sql: `SELECT\n  p.category,\n  SUM(f.net_sales) AS category_revenue\nFROM fact_order_items f\nJOIN dim_product p\n  ON f.product_id = p.product_id\nGROUP BY p.category\nORDER BY category_revenue DESC;`
  },
  {
    id: 'fc-8',
    category: 'Filters & Place',
    badge: 'CITY FILTER',
    question: 'How do you find the total sales from customers living in Manila?',
    highlight: `WHERE c.city = 'Manila'`,
    table: 'fact_order_items f JOIN dim_customer c',
    examTip: `Text literals in SQL require single quotes ('Manila') and exact casing. The WHERE clause always filters BEFORE any grouping occurs.`,
    sql: `SELECT\n  SUM(f.net_sales) AS manila_revenue\nFROM fact_order_items f\nJOIN dim_customer c\n  ON f.customer_id = c.customer_id\nWHERE c.city = 'Manila';`
  },
  {
    id: 'fc-9',
    category: 'Filters & Place',
    badge: 'GEOGRAPHIC BREAKDOWN',
    question: 'How much revenue did each customer city generate, ordered from highest to lowest?',
    highlight: 'GROUP BY c.city ORDER BY city_sales DESC',
    table: 'fact_order_items f JOIN dim_customer c',
    examTip: 'Ensure you join dim_customer for customer city. If Sir asks for seller city, join dim_seller instead!',
    sql: `SELECT\n  c.city,\n  SUM(f.net_sales) AS city_sales\nFROM fact_order_items f\nJOIN dim_customer c\n  ON f.customer_id = c.customer_id\nGROUP BY c.city\nORDER BY city_sales DESC;`
  },
  {
    id: 'fc-10',
    category: 'Time & Trends',
    badge: 'YEAR FILTER',
    question: 'How do you calculate total sales made strictly during the year 2026?',
    highlight: 'EXTRACT(YEAR FROM order_date) = 2026',
    table: 'fact_order_items',
    examTip: `Use EXTRACT(YEAR FROM order_date) = 2026 or a date range between '2026-01-01' AND '2026-12-31'. No joins needed if only filtering fact table dates!`,
    sql: `SELECT\n  SUM(net_sales) AS sales_2026\nFROM fact_order_items\nWHERE EXTRACT(YEAR FROM order_date) = 2026;`
  },
  {
    id: 'fc-11',
    category: 'Time & Trends',
    badge: 'MONTHLY TREND',
    question: 'How do you show monthly sales trend for 2026 in chronological order?',
    highlight: `DATE_TRUNC('month', order_date)::DATE + ORDER BY month ASC`,
    table: 'fact_order_items',
    examTip: '🚨 GOLDEN EXAM RULE: When the question asks for a "trend" or "over time", ORDER BY month ASC (chronological), NOT by sales DESC!',
    sql: `SELECT\n  DATE_TRUNC('month', order_date)::DATE AS month,\n  SUM(net_sales) AS monthly_sales\nFROM fact_order_items\nWHERE EXTRACT(YEAR FROM order_date) = 2026\nGROUP BY DATE_TRUNC('month', order_date)::DATE\nORDER BY month ASC;`
  },
  {
    id: 'fc-12',
    category: 'Time & Trends',
    badge: 'MONTH NUMBER',
    question: 'How do you aggregate sales by month number (1 to 12) across all years?',
    highlight: 'EXTRACT(MONTH FROM order_date) AS month_num',
    table: 'fact_order_items',
    examTip: 'EXTRACT(MONTH FROM ...) returns an integer 1-12. Group and order by the same expression so the report reads January to December.',
    sql: `SELECT\n  EXTRACT(MONTH FROM order_date) AS month_num,\n  SUM(net_sales) AS total_sales\nFROM fact_order_items\nGROUP BY EXTRACT(MONTH FROM order_date)\nORDER BY month_num ASC;`
  },
  {
    id: 'fc-13',
    category: 'SQL Rules',
    badge: 'WHERE VS HAVING',
    question: 'What is the fundamental difference between WHERE and HAVING?',
    highlight: 'WHERE = rows before grouping | HAVING = aggregates after grouping',
    table: 'SQL Execution Order',
    examTip: 'Never put SUM() or COUNT() in WHERE! If you need to filter "categories with sales > 100,000", that condition MUST be in HAVING after GROUP BY.',
    sql: `SELECT\n  p.category,\n  SUM(f.net_sales) AS total_sales\nFROM fact_order_items f\nJOIN dim_product p ON f.product_id = p.product_id\nWHERE f.quantity > 1             -- WHERE: filters rows BEFORE grouping\nGROUP BY p.category\nHAVING SUM(f.net_sales) > 100000; -- HAVING: filters aggregate AFTER grouping`
  },
  {
    id: 'fc-14',
    category: 'SQL Rules',
    badge: 'FACT VS DIMENSION',
    question: 'What is the difference between a Fact table and a Dimension table in Star Schema?',
    highlight: 'Fact = numerical metrics & FKs | Dimension = descriptive attributes',
    table: 'Star Schema Architecture',
    examTip: 'Fact tables answer "HOW MUCH / HOW MANY" (sales, quantity, dates). Dimension tables answer "WHO, WHAT, WHERE" (customer name, city, category).',
    sql: `-- Fact Table (Numbers & Foreign Keys)\nSELECT order_item_id, net_sales, quantity, product_id, customer_id\nFROM fact_order_items LIMIT 2;\n\n-- Dimension Table (Attributes & Context)\nSELECT product_id, product_name, category, brand\nFROM dim_product LIMIT 2;`
  },
  {
    id: 'fc-15',
    category: 'SQL Rules',
    badge: 'HAVING FILTER',
    question: 'How do you list only sellers who have handled more than 500 unique orders?',
    highlight: 'HAVING COUNT(DISTINCT f.order_number) > 500',
    table: 'fact_order_items f JOIN dim_seller s',
    examTip: 'Since 500 orders is an aggregate count, it cannot go in WHERE. Place it in HAVING after GROUP BY s.shop_name.',
    sql: `SELECT\n  s.shop_name,\n  COUNT(DISTINCT f.order_number) AS orders_count\nFROM fact_order_items f\nJOIN dim_seller s\n  ON f.seller_id = s.seller_id\nGROUP BY s.shop_name\nHAVING COUNT(DISTINCT f.order_number) > 500\nORDER BY orders_count DESC;`
  },
  {
    id: 'fc-16',
    category: 'Top-N & Joins',
    badge: 'MULTI-TABLE JOIN',
    question: 'How do you query customer name, product name, and revenue in a single query?',
    highlight: 'Chain multiple JOIN ... ON statements to the fact table',
    table: 'fact_order_items f + dim_customer c + dim_product p',
    examTip: 'Always start FROM the central fact table fact_order_items, then add one JOIN per dimension table connecting PK to FK.',
    sql: `SELECT\n  c.customer_name,\n  p.product_name,\n  f.quantity,\n  f.net_sales\nFROM fact_order_items f\nJOIN dim_customer c\n  ON f.customer_id = c.customer_id\nJOIN dim_product p\n  ON f.product_id = p.product_id\nORDER BY f.net_sales DESC\nLIMIT 10;`
  }
];

let flashcardIdx = 0;
let flashcardCategory = 'All';
let flashcardFlipped = false;
let flashcardTouchStartX = 0;
let flashcardTouchStartY = 0;

function toggleFlashcardMastered(cardId) {
  if (!state.flashcardMastered) state.flashcardMastered = [];
  const id = cardId || (getFilteredFlashcards()[flashcardIdx]?.id);
  if (!id) return;
  const idx = state.flashcardMastered.indexOf(id);
  if (idx !== -1) {
    state.flashcardMastered.splice(idx, 1);
    toast('Card unmarked.');
    playClick();
  } else {
    state.flashcardMastered.push(id);
    state.xp += 5;
    updateStreak(true);
    toast('★ Card mastered! +5 XP');
    playSuccess();
  }
  saveProgress();
  renderFlashcards();
}

function getFilteredFlashcards() {
  if (flashcardCategory === 'All') return FLASHCARDS;
  return FLASHCARDS.filter(c => c.category === flashcardCategory);
}

function renderFlashcards() {
  const container = $('#page-flashcards');
  if (!container) return;

  const pool = getFilteredFlashcards();
  if (flashcardIdx >= pool.length) flashcardIdx = Math.max(0, pool.length - 1);
  const card = pool[flashcardIdx];
  const masteredCount = (state.flashcardMastered || []).length;
  const masteredPct = Math.round((masteredCount / FLASHCARDS.length) * 100);
  const isMastered = card && state.flashcardMastered && state.flashcardMastered.includes(card.id);

  const categories = ['All', 'KPIs & Metrics', 'Top-N & Joins', 'Filters & Place', 'Time & Trends', 'SQL Rules'];

  container.innerHTML = `
    <div class="flashcards-layout">
      <!-- Top Filters -->
      <div class="flashcards-topbar">
        <div class="flashcard-categories">
          ${categories.map(cat => `
            <button class="category-pill ${cat === flashcardCategory ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
              ${escapeHtml(cat)}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Progress Summary Bar -->
      <div class="flashcard-progress-card">
        <div class="flashcard-progress-info">
          <div>
            <strong>${masteredCount} of ${FLASHCARDS.length} Mastered (${masteredPct}%)</strong>
            <br>
            <small>Active recall mode · Tap card to flip · Swipe or use arrows</small>
          </div>
        </div>
        <div style="min-width: 110px; text-align: right;">
          <div class="progress-track" style="height: 6px; width: 100px; margin-left: auto;">
            <span style="width: ${masteredPct}%; background: var(--good);"></span>
          </div>
          <small style="color: var(--muted); font-size: 10px;">${pool.length} in this filter</small>
        </div>
      </div>

      <!-- 3D Flashcard Stage -->
      ${card ? `
        <div class="flashcard-stage ${flashcardFlipped ? 'flipped' : ''}" id="flashcardStage" role="button" tabindex="0" aria-label="Flashcard: ${escapeHtml(card.question)}">
          <div class="flashcard-card">
            <!-- FRONT FACE -->
            <div class="flashcard-face flashcard-front">
              <div class="card-top-row">
                <span class="card-badge">${escapeHtml(card.badge)}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="pill" style="font-size:10px;">${escapeHtml(card.category)}</span>
                  ${isMastered ? '<span class="card-master-badge">★ Mastered</span>' : ''}
                </div>
              </div>

              <div class="card-question">
                <h2>${escapeHtml(card.question)}</h2>
              </div>

              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  <span class="pill" style="border-color: rgba(84,215,197,0.3); color: var(--accent-2); font-size:11px;">
                    🎯 Target: ${escapeHtml(card.highlight)}
                  </span>
                  <span class="pill" style="font-size:11px;">
                    📂 ${escapeHtml(card.table)}
                  </span>
                </div>
                <div class="card-tap-prompt">
                  <span>👆 Tap anywhere on card or press Space to see SQL answer</span>
                </div>
              </div>
            </div>

            <!-- BACK FACE -->
            <div class="flashcard-face flashcard-back">
              <div class="card-top-row">
                <span class="card-badge" style="background: rgba(124,140,255,0.16); border-color: rgba(124,140,255,0.4); color: #9bb3ff;">SQL SOLUTION</span>
                <span class="card-tap-prompt" style="font-size:11px;">👆 Tap to flip back</span>
              </div>

              <div class="card-answer-body">
                <div class="card-answer-highlight">
                  <span>⚡ Formula: ${escapeHtml(card.highlight)}</span>
                </div>
                <div class="card-sql-preview">${escapeHtml(card.sql)}</div>
                <div class="card-exam-tip">
                  <strong>💡 Midterm Tip:</strong> ${escapeHtml(card.examTip)}
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--muted);">
                <span>Table: <code>${escapeHtml(card.table)}</code></span>
                <span style="color:var(--accent); font-weight:700;">NexaCart Star Schema</span>
              </div>
            </div>
          </div>
        </div>
      ` : `
        <div class="card empty-state" style="padding: 40px 20px; text-align: center;">
          <p>No flashcards found in this category.</p>
          <button class="btn secondary" id="fcResetCatBtn">Show All Categories</button>
        </div>
      `}

      <!-- Bottom Controls -->
      <div class="flashcard-controls">
        <div class="flashcard-nav-buttons">
          <button class="btn secondary" id="fcPrevBtn" ${flashcardIdx <= 0 ? 'disabled' : ''}>
            ← Prev
          </button>
          <span class="card-counter">
            ${pool.length ? `${flashcardIdx + 1} / ${pool.length}` : '0 / 0'}
          </span>
          <button class="btn secondary" id="fcNextBtn" ${flashcardIdx >= pool.length - 1 ? 'disabled' : ''}>
            Next →
          </button>
        </div>

        <div class="actions" style="margin: 0;">
          <button class="btn" id="fcFlipBtn">
            🔄 Flip Card
          </button>
          ${card ? `
            <button class="btn ${isMastered ? 'secondary' : 'good'}" id="fcMasterBtn" style="${isMastered ? 'color: var(--good); border-color: rgba(98,212,157,0.4);' : ''}">
              ${isMastered ? '★ Mastered' : '☆ Mark as Mastered (+5 XP)'}
            </button>
          ` : ''}
          <button class="btn ghost small" id="fcShuffleBtn" title="Shuffle cards">
            🔀 Shuffle
          </button>
        </div>
      </div>

      <!-- Keyboard & Mobile Tips -->
      <div style="text-align: center; font-size: 11px; color: #5a6b8c; padding: 4px 0 16px;">
        💡 <strong>Mobile:</strong> Swipe left/right to change cards, tap to flip. &nbsp;|&nbsp; <strong>Desktop:</strong> ←/→ arrows, Space to flip, M to master.
      </div>
    </div>
  `;

  // Bind Category Buttons
  $$('.category-pill').forEach(btn => {
    btn.onclick = () => {
      flashcardCategory = btn.dataset.cat;
      flashcardIdx = 0;
      flashcardFlipped = false;
      playClick();
      renderFlashcards();
    };
  });

  if ($('#fcResetCatBtn')) {
    $('#fcResetCatBtn').onclick = () => {
      flashcardCategory = 'All';
      flashcardIdx = 0;
      flashcardFlipped = false;
      playClick();
      renderFlashcards();
    };
  }

  // Bind Card Flip by clicking stage
  const stage = $('#flashcardStage');
  if (stage) {
    stage.onclick = () => {
      flashcardFlipped = !flashcardFlipped;
      playSnap();
      renderFlashcards();
    };

    // Touch Swipe Navigation for Phones
    stage.addEventListener('touchstart', e => {
      flashcardTouchStartX = e.changedTouches[0].screenX;
      flashcardTouchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    stage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].screenX - flashcardTouchStartX;
      const dy = e.changedTouches[0].screenY - flashcardTouchStartY;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && flashcardIdx < pool.length - 1) {
          // Swipe Left -> Next
          flashcardIdx++;
          flashcardFlipped = false;
          playClick();
          renderFlashcards();
        } else if (dx > 0 && flashcardIdx > 0) {
          // Swipe Right -> Prev
          flashcardIdx--;
          flashcardFlipped = false;
          playClick();
          renderFlashcards();
        }
      }
    }, { passive: true });
  }

  // Bind Control Buttons
  if ($('#fcPrevBtn')) {
    $('#fcPrevBtn').onclick = () => {
      if (flashcardIdx > 0) {
        flashcardIdx--;
        flashcardFlipped = false;
        playClick();
        renderFlashcards();
      }
    };
  }

  if ($('#fcNextBtn')) {
    $('#fcNextBtn').onclick = () => {
      if (flashcardIdx < pool.length - 1) {
        flashcardIdx++;
        flashcardFlipped = false;
        playClick();
        renderFlashcards();
      }
    };
  }

  if ($('#fcFlipBtn')) {
    $('#fcFlipBtn').onclick = () => {
      flashcardFlipped = !flashcardFlipped;
      playSnap();
      renderFlashcards();
    };
  }

  if ($('#fcMasterBtn')) {
    $('#fcMasterBtn').onclick = () => {
      toggleFlashcardMastered(card?.id);
    };
  }

  if ($('#fcShuffleBtn')) {
    $('#fcShuffleBtn').onclick = () => {
      if (pool.length > 1) {
        let nextIdx = Math.floor(Math.random() * pool.length);
        if (nextIdx === flashcardIdx) nextIdx = (nextIdx + 1) % pool.length;
        flashcardIdx = nextIdx;
        flashcardFlipped = false;
        playClick();
        renderFlashcards();
      }
    };
  }

  // Attach Global Keyboard Handler once
  if (!window._flashcardsKeyboardBound) {
    window._flashcardsKeyboardBound = true;
    window.addEventListener('keydown', e => {
      if (currentPage !== 'flashcards') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const p = getFilteredFlashcards();
      if (e.code === 'Space') {
        e.preventDefault();
        flashcardFlipped = !flashcardFlipped;
        playSnap();
        renderFlashcards();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (flashcardIdx > 0) {
          flashcardIdx--;
          flashcardFlipped = false;
          playClick();
          renderFlashcards();
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (flashcardIdx < p.length - 1) {
          flashcardIdx++;
          flashcardFlipped = false;
          playClick();
          renderFlashcards();
        }
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        if (p[flashcardIdx]) {
          toggleFlashcardMastered(p[flashcardIdx].id);
        }
      }
    });
  }
}

init();
