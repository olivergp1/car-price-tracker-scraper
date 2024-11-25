console.log("Content script loaded.");

// MutationObserver setup
let observer;
let processedAdverts = new Set(); // Track processed advert IDs

const observerConfig = {
    childList: true,
    subtree: true,
};

function scanForAdverts() {
    console.log("Scanning page for advert containers...");

    const advertContainers = document.querySelectorAll("article.relative.flex");
    console.log(`${advertContainers.length} advert containers detected on the page.`);

    advertContainers.forEach((container, index) => {
        const advertLink = container.querySelector("a[href]");
        if (!advertLink) {
            console.log(`No advert link found in container #${index + 1}. Skipping.`);
            return;
        }

        const advertUrl = advertLink.href;
        if (advertUrl.includes("auctions") || advertUrl.includes("make-an-offer")) {
            console.log(`Skipping excluded advert: ${advertUrl}`);
            return;
        }

        const advertId = advertUrl.split("/").pop();
        if (processedAdverts.has(advertId)) {
            console.log(`Skipping already processed advert container #${index + 1}.`);
            return;
        }

        const advertTitle = container.querySelector("h2")?.textContent?.trim() || "Unknown Title";
        const advertPrice = container.querySelector("h3")?.textContent?.trim() || "Unknown Price";
        const advertLocation = container.querySelector(".text-xs")?.textContent?.trim() || "Unknown Location";

        console.log(
            `Container ${index + 1}: ID=${advertId}, Title="${advertTitle}", Price="${advertPrice}", Location="${advertLocation}".`
        );

        // Add advert ID to the processed set
        processedAdverts.add(advertId);

        // Fetch data from Firebase and inject UI
        fetchAndInjectUI(advertId, container);
    });
}

async function fetchAndInjectUI(advertId, container) {
    try {
        chrome.runtime.sendMessage({ type: "fetchAdvertData", advertId }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(
                    `Error communicating with background script for advert ID ${advertId}:`,
                    chrome.runtime.lastError.message
                );
                return;
            }

            if (response?.data) {
                injectPriceHistoryUI(container, response.data);
            } else {
                console.log(`No Firebase data found for advert ID ${advertId}.`);
            }
        });
    } catch (error) {
        console.error(`Error fetching data for advert ID ${advertId}:`, error);
    }
}

function injectPriceHistoryUI(container, data) {
  // Check if the UI is already injected
  if (container.querySelector(".price-history-ui")) {
      console.log("Price history UI already exists. Skipping duplicate injection.");
      return;
  }

  // Create the price history container
  const uiContainer = document.createElement("div");
  uiContainer.classList.add("price-history-ui");

  // Style the UI container
  uiContainer.style.display = "block"; // Ensure it's part of the normal flow
  uiContainer.style.width = "100%"; // Match the width of the container
  uiContainer.style.marginTop = "10px"; // Add spacing
  uiContainer.style.padding = "5px"; // Optional: Add padding for separation
  uiContainer.style.boxSizing = "border-box"; // Avoid size misalignment
  uiContainer.style.fontSize = "0.9em"; // Match font size
  uiContainer.style.color = "#333"; // Match text color
  uiContainer.style.backgroundColor = "transparent"; // No background

  // Build the price history content
  const advertisedDate = data.advertisedDate || "Unknown Date";
  const priceHistory = data.priceHistory || [];
  let historyHTML = `<div><strong>Advertised:</strong> ${advertisedDate}</div>`;

  if (priceHistory.length > 0) {
      historyHTML += "<div><strong>Price History:</strong></div>";
      priceHistory.forEach((entry) => {
          historyHTML += `<div style="margin-left: 15px;">${entry.date}: ${entry.price}</div>`;
      });
  } else {
      historyHTML += "<div><strong>Price History:</strong> No price changes recorded.</div>";
  }

  // Set the content
  uiContainer.innerHTML = historyHTML;

  // Append the UI container to the end of the advert container
  const targetParent = container.querySelector("div.flex.flex-grow.flex-col.justify-between.gap-2.p-2");
  if (targetParent) {
      targetParent.appendChild(uiContainer);
      console.log("Injected price history UI at the bottom of the advert content area.");
  } else {
      console.warn("Target parent for price history UI not found. Skipping injection.");
  }
}


function initializeObserver() {
    const targetNode = document.body;
    if (!targetNode) {
        console.warn("Target node not found. MutationObserver not started.");
        return;
    }

    observer = new MutationObserver((mutations) => {
        let newAdvertsFound = false;

        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches("article.relative.flex")) {
                        newAdvertsFound = true;
                    }
                });
            }
        });

        if (newAdvertsFound) {
            console.log("Page content changed. Re-scanning for advert containers...");
            scanForAdverts();
        }
    });

    observer.observe(targetNode, observerConfig);
    console.log("MutationObserver started.");
}

function initializeContentScript() {
    console.log("Initializing content script...");
    scanForAdverts(); // Initial scan for adverts
    initializeObserver(); // Start observing for changes
}

// Initialize the script
initializeContentScript();
