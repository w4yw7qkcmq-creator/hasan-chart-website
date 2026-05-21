const axios = require("axios");
const cheerio = require("cheerio");

async function fetchInvestingCalendar() {
  try {
    const url = "https://www.investing.com/economic-calendar/";

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const $ = cheerio.load(response.data);

    console.log("✅ Investing page loaded");
    console.log("Page title:", $("title").text());

    const text = $("body").text();

    if (text.includes("Economic Calendar")) {
      console.log("✅ Economic Calendar found");
    } else {
      console.log("⚠️ Economic Calendar text not found");
    }
  } catch (error) {
    console.error("❌ Error fetching Investing:", error.message);
  }
}

console.log("🚀 Economic News Worker started");

fetchInvestingCalendar();

setInterval(() => {
  fetchInvestingCalendar();
}, 60 * 1000);