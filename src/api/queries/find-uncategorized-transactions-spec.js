"use strict";

const expect = require("chai")
  .expect;
const axios = require("axios");
const findUncategorizedTransactions =
  require("./find-uncategorized-transactions");

describe("find uncategorized transactions test suite", () => {
  describe("integration test suite", () => {
    before(() => {
      // make sure the database and it's objects exists
      const dependencies = require("../../dependencies");
      dependencies.syncDatabases();
    });

    it("should find transactions", async() => {
      const request = null;
      const response = {
        status: () => {
          return {
            json: (transactions) => {
              expect(transactions.length)
                .not
                .to
                .be
                .NaN;
            }
          };
        }
      };
      const dependencies = {
        database: axios
      };
      await findUncategorizedTransactions(request, response, dependencies);
    });
  });
});
