"use strict";

const findRecentTransactions = require(
  "./api/commands/application-services/find-recent-transactions");
const importTransactions = require(
  "./api/commands/application-services/import-transactions");
const findUncategorizedTransactions = require(
  "./api/queries/find-uncategorized-transactions");
const categorizeTransactions =
  require("./api/commands/application-services/categorize-transactions");
const wrap = require("express-async-wrap");

module.exports.register = (dependencies, app) => {
  app.get("/api/transactions/states/recent",
    wrap(async(request, response) => {
      await findRecentTransactions(
        request, response, dependencies.findRecentTransactions());
    }));

  app.post("/api/transactions/states/imported",
    wrap(async(request, response) => {
      await importTransactions(
        request, response, dependencies.importTransactions());
    }));

  app.get("/api/transactions/states/uncategorized",
    wrap(async(request, response) => {
      await findUncategorizedTransactions(
        request, response, dependencies.findUncategorizedTransactions());
    }));

  app.post("/api/transactions/states/categorized",
    wrap(async(request, response) => {
      await categorizeTransactions(
        request, response, dependencies.categorizeTransactions());
      response.status(200);
      response.end();
    }));
};