// Base URL for Jikan API
const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

/**********************************************************/
/*                FETCH TRENDING ANIME                    */
/**********************************************************/
async function fetchTrendingAnime() {
  try {
    const response = await fetch(`${JIKAN_BASE_URL}/top/anime`);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.error("No trending anime found!");
      return;
    }

    displayTrendingAnime(data.data.slice(0, 10)); // Top 10 trending anime
  } catch (error) {
    console.error("Error fetching trending anime:", error);
  }
}

function displayTrendingAnime(animeList) {
  const trendingRow = document.getElementById("trendingRow");
  trendingRow.innerHTML = ""; // Clear existing panels

  animeList.forEach((anime, index) => {
    const panel = document.createElement("div");
    panel.className = "trending-panel";
    panel.dataset.panel = index + 1; // For focus handling
    panel.innerHTML = `
      <img src="${anime.images.jpg.image_url}" alt="${anime.title}" />
      <div class="vertical-title">${anime.title}</div>
      <div class="rank">${index + 1}</div>
    `;
    trendingRow.appendChild(panel);
  });

  setupTrendingPanels(); // Re-initialise panel interactivity
}

/**********************************************************/
/*                FETCH SEARCH RESULTS                    */
/**********************************************************/
async function fetchAnimeSearch(query) {
  try {
    const response = await fetch(`${JIKAN_BASE_URL}/anime?q=${encodeURIComponent(query)}&limit=6`);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      alert("No results found!");
      return;
    }

    displaySearchResults(data.data);
  } catch (error) {
    console.error("Error fetching search results:", error);
  }
}

function displaySearchResults(results) {
  const recommendationsGrid = document.querySelector(".recommendations-grid");
  recommendationsGrid.innerHTML = ""; // Clear current results

  results.forEach((anime) => {
    const recommendation = document.createElement("div");
    recommendation.className = "recommendation";
    recommendation.innerHTML = `
      <img src="${anime.images.jpg.image_url}" alt="${anime.title}" />
      <h3>${anime.title}</h3>
    `;
    recommendationsGrid.appendChild(recommendation);
  });
}

/**********************************************************/
/*                INITIATE SEARCH FUNCTION                */
/**********************************************************/
document.querySelector(".search-bar button").addEventListener("click", () => {
  const searchInput = document.querySelector(".search-bar input").value.trim();
  if (searchInput) fetchAnimeSearch(searchInput);
});

/**********************************************************/
/*                  RECOMMENDATIONS LOGIC                 */
/**********************************************************/
async function fetchRecommendations() {
  try {
    const response = await fetch(`${JIKAN_BASE_URL}/top/anime`);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.error("No recommendations found!");
      return;
    }

    displayRecommendations(data.data.slice(10, 16)); // Display anime 11-16
  } catch (error) {
    console.error("Error fetching recommendations:", error);
  }
}

function displayRecommendations(animeList) {
  const recommendationsGrid = document.querySelector(".recommendations-grid");
  recommendationsGrid.innerHTML = ""; // Clear existing recommendations

  animeList.forEach((anime) => {
    const recommendation = document.createElement("div");
    recommendation.className = "recommendation";
    recommendation.innerHTML = `
      <img src="${anime.images.jpg.image_url}" alt="${anime.title}" />
      <h3>${anime.title}</h3>
    `;
    recommendationsGrid.appendChild(recommendation);
  });
}

/**********************************************************/
/*                INITIALISE ALL FEATURES                 */
/**********************************************************/
document.addEventListener("DOMContentLoaded", () => {
  fetchTrendingAnime();
  fetchRecommendations();
  setupTrendingPanels();
});
<script src="script.js"></script>
