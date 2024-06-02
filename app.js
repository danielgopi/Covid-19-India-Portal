const express = require("express");
const app = express();
app.use(express.json());

const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbToResponsiveObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbToResponsiveObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

//Login User API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * 
    FROM user 
    WHERE username = '${username}';
    `;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get all States API
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT * 
    FROM state;
    `;
  const statesQuery = await db.all(getStatesQuery);
  response.send(
    statesQuery.map((eachState) => convertStateDbToResponsiveObject(eachState))
  );
});

//Get a State API Based on ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * 
    FROM state 
    WHERE state_id = ${stateId};
    `;
  const stateQuery = await db.get(getStateQuery);
  response.send(convertStateDbToResponsiveObject(stateQuery));
});

//Create a District API
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
    INSERT INTO 
    district (district_name, state_id, cases, cured, active, deaths)
    VALUES(
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );
    `;
  await db.run(createDistrictQuery);
  response.send("District Successfully Added");
});

//Get District API Based on ID
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT * 
    FROM district 
    WHERE district_id = ${districtId};
    `;
    const districtQuery = await db.get(getDistrictQuery);
    response.send(convertDistrictDbToResponsiveObject(districtQuery));
  }
);

//Delete District API Based on ID
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
     DELETE FROM 
     district 
     WHERE district_id = ${districtId};
     `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update District API Based on ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE district 
    SET district_name = '${districtName}', 
    state_id = ${stateId}, 
    cases = ${cases}, 
    cured = ${cured}, 
    active = ${active}, 
    deaths = ${deaths}
    WHERE district_id = ${districtId};
    `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get stats API of total cases, cured, active, deaths based on state ID
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
     SELECT SUM(cases) as totalCases, SUM(cured) as totalCured, SUM(active) as totalActive, SUM(deaths) as totalDeaths
     FROM district 
     WHERE state_id = ${stateId};
    `;
    const stats = await db.get(getStateStatsQuery);
    response.send(stats);
  }
);

module.exports = app;
