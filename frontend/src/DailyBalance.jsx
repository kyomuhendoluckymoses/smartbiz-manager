import { useEffect, useMemo, useState } from "react";

const ugandaDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);

  const get = type => parts.find(p => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const dateOf = value => {
  if (!value) return "";
  return value.includes("T")
    ? ugandaDate(new Date(value))
    : String(value).slice(0, 10);
};

const number = value => Number(value || 0);

export default function DailyBalance({
  db,
  products = [],
  productVariants = [],
  stockBatches = [],
  sales = [],
  payments = [],
  expenses = [],
  stockPurchases = [],
  money = value =>
    `UGX ${number(value).toLocaleString("en-UG")}`,
  onSaved
}) {
  const [balanceDate, setBalanceDate] = useState(ugandaDate());
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [explanation, setExplanation] = useState("");
  const [previousDay, setPreviousDay] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [calculated, setCalculated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const closed = savedRecord?.status === "Closed";

  useEffect(() => {
    let active = true;

    async function loadDay() {
      setLoading(true);
      setError("");
      setMessage("");
      setCalculated(false);
      setSavedRecord(null);
      setActualCash("");
      setExplanation("");
      setOpeningCash("");

      try {
        const existing = await db.dailyBalances
          .where("balanceDate")
          .equals(balanceDate)
          .first();

        const previous = await db.dailyBalances
          .where("status")
          .equals("Closed")
          .toArray();

        const latestPrevious = previous
          .filter(item => item.balanceDate < balanceDate)
          .sort((a, b) =>
            b.balanceDate.localeCompare(a.balanceDate)
          )[0] || null;

        if (!active) return;

        setSavedRecord(existing || null);
        setPreviousDay(latestPrevious);

        if (existing) {
          setOpeningCash(String(existing.openingCash ?? ""));
          setActualCash(String(existing.actualClosingCash ?? ""));
          setExplanation(existing.explanation || "");
          setCalculated(true);
        } else if (latestPrevious) {
          setOpeningCash(String(latestPrevious.actualClosingCash ?? 0));
        }
      } catch (err) {
        if (active) setError(err.message || "Could not load daily balance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDay();

    return () => {
      active = false;
    };
  }, [balanceDate, db]);

  const totals = useMemo(() => {
    const cashReceived = payments
      .filter(item =>
        item.paymentMethod === "Cash" &&
        dateOf(item.createdAt) === balanceDate
      )
      .reduce((sum, item) => sum + number(item.amount), 0);

    const cashExpenses = expenses
      .filter(item =>
        item.paymentMethod === "Cash" &&
        dateOf(item.expenseDate) === balanceDate
      )
      .reduce((sum, item) => sum + number(item.amount), 0);

    const cashStockPurchases = stockPurchases
      .filter(item =>
        item.paymentMethod === "Cash" &&
        dateOf(item.purchaseDate) === balanceDate
      )
      .reduce((sum, item) => sum + number(item.total), 0);

    const stockPurchased = stockPurchases
      .filter(item => dateOf(item.purchaseDate) === balanceDate)
      .reduce((sum, item) => sum + number(item.quantity), 0);

    const quantitySold = sales
      .filter(item => dateOf(item.createdAt) === balanceDate)
      .reduce((sum, item) => sum + number(item.quantity), 0);

    const remainingStock = stockBatches.reduce(
      (sum, batch) => sum + number(batch.quantityRemaining),
      0
    );

    return {
      cashReceived,
      cashExpenses,
      cashStockPurchases,
      stockPurchased,
      quantitySold,
      remainingStock
    };
  }, [
    balanceDate,
    payments,
    expenses,
    stockPurchases,
    sales,
    stockBatches
  ]);

  const opening = number(openingCash);

  const expectedClosing =
    opening +
    totals.cashReceived -
    totals.cashExpenses -
    totals.cashStockPurchases;

  const difference = number(actualCash) - expectedClosing;

  function calculateBalance() {
    if (openingCash === "" || !Number.isFinite(opening)) {
      setError("Enter a valid opening cash amount.");
      return;
    }

    if (opening < 0) {
      setError("Opening cash cannot be negative.");
      return;
    }

    setError("");
    setCalculated(true);
    setMessage("Daily balance calculated successfully.");
  }

  async function closeDay() {
    if (closed) return;

    if (!calculated) {
      setError("Click Balance first to calculate the daily totals.");
      return;
    }

    if (actualCash === "" || !Number.isFinite(number(actualCash))) {
      setError("Enter the actual cash counted before closing the day.");
      return;
    }

    if (number(actualCash) < 0) {
      setError("Actual cash cannot be negative.");
      return;
    }

    if (difference !== 0 && !explanation.trim()) {
      setError("Explain the cash difference before closing the day.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const existing = await db.dailyBalances
        .where("balanceDate")
        .equals(balanceDate)
        .first();

      if (existing?.status === "Closed") {
        setSavedRecord(existing);
        setError("This day has already been closed.");
        return;
      }

      const record = {
        balanceDate,
        openingCash: opening,
        cashReceived: totals.cashReceived,
        cashExpenses: totals.cashExpenses,
        cashStockPurchases: totals.cashStockPurchases,
        expectedClosingCash: expectedClosing,
        actualClosingCash: number(actualCash),
        difference,
        explanation: explanation.trim(),
        stockPurchased: totals.stockPurchased,
        quantitySold: totals.quantitySold,
        remainingStock: totals.remainingStock,
        status: "Closed",
        createdAt: new Date().toISOString(),
        closedAt: new Date().toISOString()
      };

      await db.dailyBalances.add(record);

      const saved = await db.dailyBalances
        .where("balanceDate")
        .equals(balanceDate)
        .first();

      setSavedRecord(saved);
      setMessage("Day closed and daily report saved successfully.");

      if (onSaved) await onSaved();
    } catch (err) {
      setError(err.message || "Could not close the day.");
    } finally {
      setLoading(false);
    }
  }

  const summary = [
    ["Opening cash", opening],
    ["Cash received", totals.cashReceived],
    ["Cash expenses", -totals.cashExpenses],
    ["Cash stock purchases", -totals.cashStockPurchases],
    ["Expected closing cash", expectedClosing]
  ];

  return (
    <div className="page-container">
      <h2>Daily Balance</h2>
      <p className="muted">
        Calculate and close your daily physical cash balance.
      </p>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <label>
          Business date
          <input
            type="date"
            value={balanceDate}
            onChange={e => setBalanceDate(e.target.value)}
            disabled={closed || loading}
          />
        </label>

        {previousDay && (
          <p className="muted">
            Opening cash carried forward from {previousDay.balanceDate}:
            {" "}{money(previousDay.actualClosingCash)}
          </p>
        )}

        {closed && (
          <p className="success-message">
            This day is closed. Its saved figures cannot be edited here.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Cash calculation</h3>

        <label>
          Opening cash (UGX)
          <input
            type="number"
            min="0"
            value={openingCash}
            onChange={e => setOpeningCash(e.target.value)}
            disabled={closed}
            placeholder="Enter opening cash"
          />
        </label>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(([label, amount]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{money(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={calculateBalance}
          disabled={closed || loading}
        >
          Balance
        </button>
      </div>

      {calculated && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3>Cash count</h3>

          <label>
            Actual cash counted (UGX)
            <input
              type="number"
              min="0"
              value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              disabled={closed}
              placeholder="Enter physical cash counted"
            />
          </label>

          <p>
            Expected closing cash: <strong>{money(expectedClosing)}</strong>
          </p>

          <p>
            Difference:{" "}
            <strong>
              {money(actualCash === "" ? 0 : difference)}
            </strong>
          </p>

          {difference !== 0 && (
            <label>
              Explain the difference
              <textarea
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                disabled={closed}
                placeholder="Explain why the counted cash differs..."
              />
            </label>
          )}

          {!closed && (
            <button
              type="button"
              className="primary-button"
              onClick={closeDay}
              disabled={loading}
            >
              {loading ? "Saving..." : "Close Day"}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>Daily stock activity</h3>

        <div className="cards">
          <div className="card">
            <p>Stock purchased</p>
            <h2>{totals.stockPurchased}</h2>
          </div>

          <div className="card">
            <p>Quantity sold</p>
            <h2>{totals.quantitySold}</h2>
          </div>

          <div className="card">
            <p>Current remaining stock</p>
            <h2>{totals.remainingStock}</h2>
          </div>
        </div>

        <p className="muted">
          Remaining stock is the current inventory across all recorded
          batches, not a historical closing-stock snapshot for this date.
        </p>
      </div>
    </div>
  );
}