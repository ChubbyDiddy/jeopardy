const API_URL = "https://rithm-jeopardy.herokuapp.com/api";
const NUMBER_OF_CATEGORIES = 6;
const NUMBER_OF_CLUES_PER_CATEGORY = 5;

// Global game state that is shared across setup, gameplay, and scoring.
let categories = [];
let activeClue = null;
let activeClueMode = 0;
let isPlayButtonClickable = true;
let dailyDoubleId = null;
let currentClueValue = 0;
let players = [];
let pendingDailyDoubleQuestion = false;
let playerSetupNames = ["", ""];

// Wire up all UI events once when the script loads.
$("#play").on("click", handleClickOfPlay);
$("#restart").on("click", returnToPlayerSetup);
$("#add-player").on("click", addPlayerInput);
$("#active-clue").on("click", handleClickOfActiveClue);
$("#active-clue").on("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleClickOfActiveClue();
  }
});
$("#nobody-correct").on("click", finishScoring);
$("#reveal-daily-double").on("click", revealDailyDoubleQuestion);
$("#daily-double-wager").on("keydown", event => {
  if (event.key === "Enter") {
    revealDailyDoubleQuestion();
  }
});

// Render the player setup screen on initial page load.
renderPlayerSetup();

// Validate player inputs and begin loading a new board.
function handleClickOfPlay() {
  if (!isPlayButtonClickable) {
    return;
  }

  const names = getPlayerNamesFromSetup();

  if (names.length < 2) {
    $("#player-setup-error").text("Please add at least two players.");
    return;
  }

  playerSetupNames = names;
  $("#player-setup-error").text("");
  setupTheGame();
}

// Build the dynamic player name inputs for pre-game setup.
function renderPlayerSetup() {
  const $setup = $("#player-setup").empty();

  playerSetupNames.forEach((name, index) => {
    const $row = $("<div>").addClass("player-input-row");
    const inputId = `player-name-${index}`;

    const $label = $("<label>")
      .attr("for", inputId)
      .text(`Player ${index + 1}`);

    const $input = $("<input>")
      .attr({
        id: inputId,
        type: "text",
        maxlength: 18,
        placeholder: `Enter Player ${index + 1} name`
      })
      .val(name);

    const $remove = $("<button>")
      .attr("type", "button")
      .addClass("remove-player")
      .attr("aria-label", `Remove Player ${index + 1}`)
      .text("Remove")
      .prop("disabled", playerSetupNames.length <= 2)
      .on("click", () => removePlayerInput(index));

    $row.append($label, $input, $remove);
    $setup.append($row);
  });
}

// Read setup inputs and apply fallback names for empty fields.
function getPlayerNamesFromSetup() {
  return $("#player-setup input")
    .map((index, input) => $(input).val().trim() || `Player ${index + 1}`)
    .get();
}

  // Add a new player input row and focus it.
function addPlayerInput() {
  playerSetupNames = getPlayerNamesFromSetup();
  playerSetupNames.push("");
  renderPlayerSetup();
  $("#player-setup input").last().trigger("focus");
}

// Remove one player row while enforcing the minimum of two players.
function removePlayerInput(index) {
  if (playerSetupNames.length <= 2) {
    return;
  }

  playerSetupNames = getPlayerNamesFromSetup();
  playerSetupNames.splice(index, 1);
  renderPlayerSetup();
}

// Return from the game board to setup while preserving current player names.
function returnToPlayerSetup() {
  playerSetupNames = players.length
    ? players.map(player => player.name)
    : getPlayerNamesFromSetup();

  closeDailyDoubleOverlay();
  $("#game-screen").addClass("disabled");
  $("#start-screen").removeClass("disabled");
  $("#play").text("Start the Game!").prop("disabled", false);
  $("#player-setup-error").text("");
  renderPlayerSetup();
}

// Reset runtime state, fetch categories, and draw a fresh board.
async function setupTheGame() {
  isPlayButtonClickable = false;
  activeClue = null;
  activeClueMode = 0;
  dailyDoubleId = null;
  currentClueValue = 0;
  pendingDailyDoubleQuestion = false;
  closeDailyDoubleOverlay();

  setupPlayers();
  renderScoreboard();

  // Switch from the title screen to the game screen.
  $("#start-screen").addClass("disabled");
  $("#game-screen").removeClass("disabled");

  $("#spinner").removeClass("disabled");
  $("#play, #restart").prop("disabled", true);
  $("#restart").text("Loading...");
  $("#categories, #clues").empty();
  $("#answer-controls").addClass("disabled");
  $("#active-clue")
    .removeClass("question answer end-message error-message daily-double-message")
    .html("Choose a dollar amount to begin.");

  try {
    const categoryIds = await getCategoryIds();

    // Multiple requests are started together and completed with Promise.all().
    categories = await Promise.all(categoryIds.map(getCategoryData));

    chooseDailyDouble();
    fillTable(categories);
    $("#restart").text("Restart Game");
  } catch (error) {
    console.error("Unable to load Jeopardy:", error);
    categories = [];
    $("#active-clue")
      .addClass("error-message")
      .html("The game could not load. Click Try Again.");
    $("#restart").text("Try Again");
  } finally {
    $("#spinner").addClass("disabled");
    $("#play, #restart").prop("disabled", false);
    isPlayButtonClickable = true;
  }
}

// Initialize player objects used by the scoreboard and scoring logic.
function setupPlayers() {
  players = playerSetupNames.map((name, index) => ({
    name: name || `Player ${index + 1}`,
    score: 0
  }));
}

// Render scoreboard cards and per-player "Correct" scoring buttons.
function renderScoreboard() {
  const $scoreboard = $("#scoreboard").empty();
  const $answerButtons = $("#answer-buttons").empty();

  players.forEach((player, index) => {
    const $card = $("<article>").addClass("player-card").html(`
      <h2>${escapeHtml(player.name)}</h2>
      <p>$${player.score}</p>
    `);

    const $correctButton = $("<button>")
      .attr("type", "button")
      .text(`${player.name} Correct`)
      .on("click", () => awardPoints(index));

    $scoreboard.append($card);
    $answerButtons.append($correctButton);
  });
}

// Fetch a large category pool, then pick a random usable subset.
async function getCategoryIds() {
  // fetch() sends a GET request by default.
  const response = await fetch(`${API_URL}/categories?count=100`);

  if (!response.ok) {
    throw new Error("Could not retrieve category IDs.");
  }

  const categoryData = await response.json();
  const usableCategories = categoryData.filter(
    category => category.clues_count >= NUMBER_OF_CLUES_PER_CATEGORY
  );

  if (usableCategories.length < NUMBER_OF_CATEGORIES) {
    throw new Error("Not enough usable categories were returned.");
  }

  return _.sampleSize(usableCategories, NUMBER_OF_CATEGORIES).map(
    category => category.id
  );
}

// Fetch full category data and normalize it to fixed-value clues.
async function getCategoryData(categoryId) {
  // This is another GET request for one complete category.
  const response = await fetch(`${API_URL}/category?id=${categoryId}`);

  if (!response.ok) {
    throw new Error(`Could not retrieve category ${categoryId}.`);
  }

  const category = await response.json();
  const usableClues = category.clues.filter(
    clue => clue.question && clue.answer
  );

  if (usableClues.length < NUMBER_OF_CLUES_PER_CATEGORY) {
    throw new Error(`Category ${categoryId} does not have enough clues.`);
  }

  const selectedClues = _.sampleSize(
    usableClues,
    NUMBER_OF_CLUES_PER_CATEGORY
  ).map((clue, index) => ({
    id: clue.id,
    value: (index + 1) * 200,
    question: clue.question,
    answer: clue.answer
  }));

  return {
    id: category.id,
    title: category.title,
    clues: selectedClues
  };
}

// Randomly mark one clue as the Daily Double for this board.
function chooseDailyDouble() {
  const category = _.sample(categories);
  const clue = _.sample(category.clues);
  dailyDoubleId = `${category.id}-${clue.id}`;
}

// Build the category headers and clue buttons in the game table.
function fillTable(gameCategories) {
  const $categoryRow = $("#categories").empty();
  const $clueRow = $("#clues").empty();

  gameCategories.forEach(category => {
    const $categoryHeading = $("<th>")
      .text(category.title)
      .attr("scope", "col");

    const $categoryColumn = $("<td>");

    category.clues.forEach(clue => {
      const clueElementId = `${category.id}-${clue.id}`;
      const $clue = $("<button>")
        .addClass("clue")
        .attr("type", "button")
        .attr("id", clueElementId)
        .attr("aria-label", `${category.title} for $${clue.value}`)
        .text(`$${clue.value}`)
        .on("click", handleClickOfClue);

      if (clueElementId === dailyDoubleId) {
        $clue.attr("data-daily-double", "true");
      }

      $categoryColumn.append($clue);
    });

    $categoryRow.append($categoryHeading);
    $clueRow.append($categoryColumn);
  });
}

// Handle clue selection: lock the clue, remove it from data, and show question flow.
function handleClickOfClue(event) {
  if (activeClueMode !== 0) {
    return;
  }

  const $clickedClue = $(event.currentTarget);
  const [categoryIdText, clueIdText] = $clickedClue.attr("id").split("-");
  const categoryId = Number(categoryIdText);
  const clueId = Number(clueIdText);
  const categoryIndex = categories.findIndex(category => category.id === categoryId);

  if (categoryIndex === -1) {
    return;
  }

  const clueIndex = categories[categoryIndex].clues.findIndex(
    clue => clue.id === clueId
  );

  if (clueIndex === -1) {
    return;
  }

  activeClue = categories[categoryIndex].clues[clueIndex];
  currentClueValue = activeClue.value;
  categories[categoryIndex].clues.splice(clueIndex, 1);

  if (categories[categoryIndex].clues.length === 0) {
    categories.splice(categoryIndex, 1);
  }

  activeClueMode = 1;
  $clickedClue.addClass("viewed").prop("disabled", true).text("");

  if ($clickedClue.data("daily-double") === true) {
    pendingDailyDoubleQuestion = true;
    openDailyDoubleOverlay();
    return;
  }

  showActiveQuestion();
}

// Show the Daily Double modal and enforce the wager cap.
function openDailyDoubleOverlay() {
  const maximumWager = activeClue.value * 2;

  $("#daily-double-wager")
    .attr("max", maximumWager)
    .val(activeClue.value);
  $("#daily-double-limit").text(`Maximum wager: $${maximumWager}`);
  $("#daily-double-error").text("");
  $("#daily-double-overlay").removeClass("disabled");
  $("#daily-double-wager").trigger("focus").select();
}

// Hide and reset Daily Double modal feedback.
function closeDailyDoubleOverlay() {
  $("#daily-double-overlay").addClass("disabled");
  $("#daily-double-error").text("");
}

// Validate wager input, then continue to the clue question.
function revealDailyDoubleQuestion() {
  if (!pendingDailyDoubleQuestion || !activeClue) {
    return;
  }

  const maximumWager = activeClue.value * 2;
  const wager = Number($("#daily-double-wager").val());

  if (!Number.isFinite(wager) || wager < 0 || wager > maximumWager) {
    $("#daily-double-error").text(`Enter a wager from $0 to $${maximumWager}.`);
    return;
  }

  currentClueValue = wager;
  pendingDailyDoubleQuestion = false;
  closeDailyDoubleOverlay();
  showActiveQuestion(true);
}

// Display the active clue question, with optional Daily Double label.
function showActiveQuestion(isDailyDouble = false) {
  $("#active-clue")
    .removeClass("answer end-message error-message")
    .toggleClass("daily-double-message", isDailyDouble)
    .addClass("question")
    .html(`${isDailyDouble ? "<strong>DAILY DOUBLE!</strong><br>" : ""}${activeClue.question}<span>Click to reveal the answer.</span>`);
}

  // Flip from question to answer and reveal scoring controls.
function handleClickOfActiveClue() {
  if (activeClueMode === 1) {
    activeClueMode = 2;
    $("#active-clue")
      .removeClass("question daily-double-message")
      .addClass("answer")
      .html(`${activeClue.answer}<span>Use the buttons below to score this clue.</span>`);
    $("#answer-controls").removeClass("disabled");
  }
}

// Add clue value to the selected player, then finalize the clue turn.
function awardPoints(playerIndex) {
  players[playerIndex].score += currentClueValue;
  renderScoreboard();
  finishScoring();
}

// Reset clue state and either continue play or show the final winner.
function finishScoring() {
  if (activeClueMode !== 2) {
    return;
  }

  activeClueMode = 0;
  activeClue = null;
  currentClueValue = 0;
  $("#answer-controls").addClass("disabled");

  if (categories.length === 0) {
    const winner = getWinnerText();
    $("#active-clue")
      .removeClass("answer")
      .addClass("end-message")
      .html(`${winner}<span>Click Restart to play again.</span>`);
  } else {
    $("#active-clue")
      .removeClass("answer")
      .html("Choose another dollar amount.");
  }
}

// Return a winner/tie message based on final scores.
function getWinnerText() {
  const highestScore = Math.max(...players.map(player => player.score));
  const winners = players.filter(player => player.score === highestScore);

  if (winners.length > 1) {
    const winnerNames = winners.map(player => escapeHtml(player.name)).join(", ");
    return `${winnerNames} tie at $${highestScore}!`;
  }

  return `${escapeHtml(winners[0].name)} wins with $${highestScore}!`;
}

// Escape user-provided text before inserting it into HTML.
function escapeHtml(value) {
  return $("<div>").text(value).html();
}
