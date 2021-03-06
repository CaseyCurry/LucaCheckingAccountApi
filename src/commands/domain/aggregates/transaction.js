import { BaseAggregate } from "./base-aggregate";
import { TransactionCategorizedEvent } from "../events/transaction-categorized-event";

// TODO: unit test
const Transaction = class extends BaseAggregate {
  constructor({
    id,
    tenantId,
    account,
    date,
    description,
    amount,
    isDeposit,
    categorization,
    relatedTransaction,
    ignoreInReports
  }) {
    super();
    this.id = id;
    this.tenantId = tenantId;
    this.account = account;
    this.date = date;
    this.description = description;
    this.amount = amount;
    this.isDeposit = isDeposit;
    this.categorization = categorization;
    this.relatedTransaction = relatedTransaction;
    this.ignoreInReports = ignoreInReports;
  }

  async categorize(categorization) {
    this.categorization = categorization;
    await this.domainEvents.raise(
      new TransactionCategorizedEvent(
        this.id,
        this.tenantId,
        this.categorization,
        this.amount,
        this.isDeposit,
        this.date
      )
    );
  }

  splitAmount(amount) {
    const minRemainingAmount = 0.01;
    const maxRemainingAmount = this.amount - 0.01;
    if (amount > maxRemainingAmount || amount < minRemainingAmount) {
      throw new Error("The amount is invalid");
    }
    this.amount = parseFloat((this.amount - amount).toFixed(2));
  }
};

export { Transaction };
