// This is the API I am using to get the Jeopardy data
const API_BASE_URL = "https://rithm-jeopardy.herokuapp.com/api";

// I want 6 categories going across the board
const NUM_CATEGORIES = 6;

// Since the top row is the category row, I need 5 clue rows under it
const NUM_CLUES_PER_CATEGORY = 5;

// Grabbing the main things I need from the HTML
const startButton = document.querySelector("#start");
const gameBoard = document.querySelector("#game-board");
const scoreboard = document.querySelector("#scoreboard");
const message = document.querySelector("#message");

const player1Input = document.querySelector("#player1-name");
const player2Input = document.querySelector("#player2-name");

// This will hold all of the categories and clues after I get them from the API
let categories = [];

// This keeps track of both players and their scores
let players = [];

// This will hold the random Daily Double spot
let dailyDoubleLocation = null;

// When the button is clicked, restart the game
startButton.addEventListener("click", startGame);

// This makes the board show as soon as the page loads
window.addEventListener("load", startGame);


// This is where the whole game starts
async function startGame() {
    setupPlayers();

    gameBoard.innerHTML = "";
    scoreboard.innerHTML = "";
    message.innerText = "Loading game...";

    renderScoreboard();

    try {
        categories = await getCategories();

        dailyDoubleLocation = getRandomDailyDoubleLocation();

        gameBoard.innerHTML = "";
        message.innerText = "";

        createBoard();

    } catch (error) {
        console.error(error);
        message.innerText = "Something went wrong loading the game. Try restarting.";
    }
}


// This creates the players and starts their scores at 0
function setupPlayers() {
    players = [
        {
            name: player1Input.value || "Player 1",
            score: 0
        },
        {
            name: player2Input.value || "Player 2",
            score: 0
        }
    ];
}


// This builds the scoreboard with buttons to add or subtract points
function renderScoreboard() {
    scoreboard.innerHTML = "";

    players.forEach((player, index) => {
        const playerCard = document.createElement("div");

        playerCard.classList.add("player-card");

        playerCard.innerHTML = `
            <h2>${player.name}</h2>
            <p>$${player.score}</p>

            <button onclick="changeScore(${index}, 100)">+100</button>
            <button onclick="changeScore(${index}, -100)">-100</button>

            <button onclick="changeScore(${index}, 200)">+200</button>
            <button onclick="changeScore(${index}, -200)">-200</button>

            <button onclick="changeScore(${index}, 500)">+500</button>
            <button onclick="changeScore(${index}, -500)">-500</button>
        `;

        scoreboard.append(playerCard);
    });
}


// This adds or takes away points from a player
function changeScore(playerIndex, amount) {
    players[playerIndex].score += amount;
    renderScoreboard();
}


// This gets 6 random categories from the API
async function getCategories() {
    const response = await fetch(`${API_BASE_URL}/categories?count=${NUM_CATEGORIES}`);

    if (!response.ok) {
        throw new Error("Could not get categories from the API");
    }

    const categoryData = await response.json();

    // After getting the categories, I use each id to get the clues for that category
    const categoryPromises = categoryData.map(category => {
        return getCategory(category.id);
    });

    const fullCategories = await Promise.all(categoryPromises);

    return fullCategories;
}


// This gets one full category using the category id
async function getCategory(categoryId) {
    const response = await fetch(`${API_BASE_URL}/category?id=${categoryId}`);

    if (!response.ok) {
        throw new Error("Could not get category clues from the API");
    }

    const category = await response.json();

    // I am only keeping clues that actually have both a question and an answer
    const goodClues = category.clues.filter(clue => {
        return clue.question && clue.answer;
    });

    const shuffledClues = shuffleArray(goodClues);

    return {
        title: category.title,
        clues: shuffledClues.slice(0, NUM_CLUES_PER_CATEGORY)
    };
}


// This randomly picks one clue on the board to be the Daily Double
function getRandomDailyDoubleLocation() {
    return {
        categoryIndex: Math.floor(Math.random() * NUM_CATEGORIES),
        clueIndex: Math.floor(Math.random() * NUM_CLUES_PER_CATEGORY)
    };
}


// This puts the whole board together
function createBoard() {
    createCategoryRow();
    createClueRows();
}


// This creates the top row with the category names
function createCategoryRow() {
    for (let category of categories) {
        const categoryDiv = document.createElement("div");

        categoryDiv.classList.add("category");
        categoryDiv.innerText = category.title;

        gameBoard.append(categoryDiv);
    }
}


// This creates all of the clue boxes under the categories
function createClueRows() {
    for (let clueIndex = 0; clueIndex < NUM_CLUES_PER_CATEGORY; clueIndex++) {
        for (let categoryIndex = 0; categoryIndex < NUM_CATEGORIES; categoryIndex++) {
            const clue = categories[categoryIndex].clues[clueIndex];

            const clueDiv = document.createElement("div");

            clueDiv.classList.add("clue");

            clueDiv.innerText = `$${(clueIndex + 1) * 200}`;

            clueDiv.dataset.question = clue.question;
            clueDiv.dataset.answer = clue.answer;
            clueDiv.dataset.showing = "value";

            if (
                dailyDoubleLocation.categoryIndex === categoryIndex &&
                dailyDoubleLocation.clueIndex === clueIndex
            ) {
                clueDiv.dataset.dailyDouble = "true";
                clueDiv.classList.add("daily-double");
            }

            clueDiv.addEventListener("click", handleClueClick);

            gameBoard.append(clueDiv);
        }
    }
}


// This controls what happens each time a clue is clicked
function handleClueClick(event) {
    const clueDiv = event.target;

    if (clueDiv.dataset.showing === "finished") {
        return;
    }

    if (clueDiv.dataset.showing === "value") {
        if (clueDiv.dataset.dailyDouble === "true") {
            clueDiv.innerHTML = "DAILY DOUBLE!<br><br>Click again for the question.";
        } else {
            clueDiv.innerHTML = clueDiv.dataset.question;
        }

        clueDiv.dataset.showing = "question";
        clueDiv.classList.add("used");
    }

    else if (clueDiv.dataset.showing === "question") {
        clueDiv.innerHTML = clueDiv.dataset.answer;
        clueDiv.dataset.showing = "answer";
    }

    else if (clueDiv.dataset.showing === "answer") {
        clueDiv.innerHTML = "";
        clueDiv.dataset.showing = "finished";
        clueDiv.classList.add("finished");
    }
}


// This just shuffles an array so the clues are not always in the same order
function shuffleArray(array) {
    const arrayCopy = [...array];

    for (let i = arrayCopy.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));

        const temp = arrayCopy[i];
        arrayCopy[i] = arrayCopy[randomIndex];
        arrayCopy[randomIndex] = temp;
    }

    return arrayCopy;
}