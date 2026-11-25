import { useEffect, useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Wallet, Landmark,
  Users, Receipt, ChartNoAxesCombined, Settings, Plus, Trash2,
  RefreshCw, Printer, Eye, X, CreditCard, CheckCircle, ArrowLeftRight
} from "lucide-react";

import { db, deleteWithSync } from "./db";
import { syncLocalToCloud } from "./lib/sync";
import { supabase, supabaseUrl, supabaseKey } from "./lib/supabase";
import "./App.css";

const money = (amount) =>
  new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const emptySale = {
  productId: "", quantity: "1", sellingPrice: "", location: "Main Shop", customerName: "",
  customerPhone: "", saleType: "Cash Sale",
  amountPaid: "", paymentMethod: "Cash", financialAccountId: "", dueDate: ""
};

const emptyExpense = {
  category: "Rent", description: "", amount: "",
  paymentMethod: "Cash", financialAccountId: "", date: today()
};

const emptyBank = {
  transactionType: "Deposit", accountName: "",
  amount: "", description: "", transactionDate: today()
};

const emptyPurchase = {
  productId: "", supplierName: "", quantity: "", location: "Main Shop",
  buyingPrice: "", purchaseDate: today(), paymentMethod: "Cash", financialAccountId: ""
};

function App() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession || null);
    });

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (active) setSession(data.session || null);
      })
      .catch((sessionError) => {
        console.error("SmartBiz session check failed:", sessionError);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);
  const [activePage, setActivePage] = useState("Dashboard");
  const [hasEntered, setHasEntered] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('month');
  const [cloudStatus, setCloudStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    const checkCloudConnection = async () => {
      if (!navigator.onLine) {
        if (active) setCloudStatus("offline");
        return;
      }

      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: supabaseKey }
        });

        if (!response.ok) throw new Error("Cloud health check failed");
        if (active) setCloudStatus("online");
      } catch {
        if (active) setCloudStatus("offline");
      }
    };

    const handleOnline = () => checkCloudConnection();
    const handleOffline = () => setCloudStatus("offline");

    checkCloudConnection();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = window.setInterval(checkCloudConnection, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [products, setProducts] = useState([]);
  const [trashedProducts, setTrashedProducts] = useState([]);
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("All");
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [stockPurchases, setStockPurchases] = useState([]);
  const [stockBatches, setStockBatches] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [financialTransactions, setFinancialTransactions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptWidth, setReceiptWidth] = useState("thermal-80");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingProductId, setEditingProductId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "", sku: "",
    buyingPrice: "", sellingPrice: "", quantity: ""
  });

  const [saleForm, setSaleForm] = useState(emptySale);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [bankForm, setBankForm] = useState(emptyBank);

  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "Cash",
    provider: "",
    openingBalance: "0"
  });
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [purchaseItems, setPurchaseItems] = useState([{ productId: "", productName: "", quantity: "", buyingPrice: "", sellingPrice: "" }]);

  const [paymentForm, setPaymentForm] = useState({
    saleId: "", amount: "", paymentMethod: "Cash", financialAccountId: ""
  });
  const [transferForm, setTransferForm] = useState(() => ({
    productId: "",
    quantity: "",
    fromLocation: "Main Shop",
    toLocation: "Second Shop",
    transferDate: new Date().toISOString().slice(0, 10)
  }));

  const menu = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Sales", icon: ShoppingCart },
    { name: "Products", icon: Package },
    { name: "Trash", icon: Trash2 },
    { name: "Inventory", icon: Package },
    { name: "Stock In", icon: Plus },
    { name: "Stock Sold", icon: ShoppingCart },
    { name: "Move Stock", icon: ArrowLeftRight },
    { name: "Customers", icon: Users },
    { name: "Creditors", icon: Users },
    { name: "Payments", icon: CreditCard },
    { name: "Receipts", icon: Receipt },
    { name: "Expenses", icon: Wallet },
    { name: "Banking", icon: Landmark },
    { name: "Financial Management", icon: Wallet },
    { name: "Reports", icon: ChartNoAxesCombined },
    { name: "Settings", icon: Settings }
  ];

  // FIFO: create opening batches only for products without batches.
  async function migrateExistingStock() {
    await db.transaction(
      "rw", db.products, db.stockPurchases, db.stockBatches,
      async () => {
        const allProducts = await db.products.toArray();

        for (const product of allProducts) {
          const existing = await db.stockBatches
            .where("productId").equals(product.id).toArray();

          if (existing.length > 0) continue;

          const purchases = await db.stockPurchases
            .where("productId").equals(product.id).toArray();

          const purchasedQuantity = purchases.reduce(
            (sum, p) => sum + Number(p.quantity || 0), 0
          );

          const openingQuantity = Math.max(
            0, Number(product.quantity || 0) - purchasedQuantity
          );

          if (openingQuantity > 0) {
            const openingCost =
              product.name?.toLowerCase() === "mattress"
                ? 180000
                : Number(product.buyingPrice || 0);

            await db.stockBatches.add({
              productId: product.id,
              purchaseId: null,
              supplierName: "Opening stock",
              quantityReceived: openingQuantity,
              quantityRemaining: openingQuantity,
              unitCost: openingCost,
              purchaseDate: "2000-01-01",
              createdAt: new Date().toISOString(),
              location: "Main Shop",
              batchType: "Opening stock"
            });
          }

          for (const purchase of purchases) {
            await db.stockBatches.add({
              productId: product.id,
              purchaseId: purchase.id,
              supplierName: purchase.supplierName || "Supplier",
              quantityReceived: Number(purchase.quantity || 0),
              quantityRemaining: Number(purchase.quantity || 0),
              unitCost: Number(purchase.buyingPrice || 0),
              purchaseDate: purchase.purchaseDate || today(),
              createdAt: purchase.createdAt || new Date().toISOString(),
              location: "Main Shop",
              batchType: "Stock purchase"
            });
          }
        }
      }
    );
  }

  // LOAD DATA - TWO-WAY SYNC WITH THE CLOUD, THEN SHOW LOCAL RECORDS
  async function loadData(options) {
    const silent = options?.silent === true;

    if (!silent) setLoading(true);
    if (!silent) setError("");

    let syncProblem = "";

    try {
      if (navigator.onLine) {
        // A sync problem must never stop the app from showing local records.
        try {
          const result = await syncLocalToCloud();
          console.log("SmartBiz sync completed:", result);

          if (result.warnings?.length) {
            syncProblem = result.warnings[0];
          }
        } catch (syncErr) {
          console.error("SmartBiz sync error:", syncErr);
          syncProblem = "Cloud sync problem: " + (syncErr?.message || syncErr);
        }
      } else {
        console.warn("Device is offline. Loading locally saved records.");
      }

      // Run stock migration only after cloud records have been restored.
      await migrateExistingStock();

      const [p, s, c, pay, ex, bank, purchases, batches, accounts, transactions, transfers] =
        await Promise.all([
          db.products.toArray(),
          db.sales.orderBy("createdAt").reverse().toArray(),
          db.customers.toArray(),
          db.payments.orderBy("createdAt").reverse().toArray(),
          db.expenses.orderBy("createdAt").reverse().toArray(),
          db.bankTransactions.orderBy("createdAt").reverse().toArray(),
          db.stockPurchases.orderBy("createdAt").reverse().toArray(),
          db.stockBatches.toArray(),
          db.financialAccounts.orderBy("createdAt").toArray(),
          db.financialTransactions.orderBy("createdAt").reverse().toArray(),
          db.stockTransfers.orderBy("createdAt").reverse().toArray()
        ]);

      setProducts(p.filter(product => !product.deletedAt));
      setTrashedProducts(p.filter(product => Boolean(product.deletedAt)));
      setSales(s);
      setCustomers(c);
      setPayments(pay);
      setExpenses(ex);
      setBankTransactions(bank);
      setStockPurchases(purchases);
      setStockBatches(batches);
      setStockTransfers(transfers);
      setFinancialAccounts(accounts);
      setFinancialTransactions(transactions);

      if (syncProblem) setError(syncProblem);
      else if (silent) setError("");

      console.log("SmartBiz dashboard records loaded:", {
        products: p.length,
        sales: s.length,
        customers: c.length,
        expenses: ex.length,
        payments: pay.length,
        bankTransactions: bank.length,
        stockPurchases: purchases.length
      });
    } catch (err) {
      console.error("SmartBiz loading error:", err);
      setError("Could not load business records: " + (err?.message || err));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // KEEP PHONE AND COMPUTER IN STEP: sync when the app is opened, when it
  // comes back to the screen, when the internet returns, and every minute.
  useEffect(() => {
    if (!session) return undefined;

    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        loadData({ silent: true });
      }
    };

    const interval = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // FINANCIAL ACCOUNT SETUP
  async function addFinancialAccount(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const name = accountForm.name.trim();
    const openingBalance = Number(accountForm.openingBalance);

    if (!name || !Number.isFinite(openingBalance) || openingBalance < 0) {
      return setError("Enter a valid account name and opening balance.");
    }

    if (financialAccounts.some(a =>
      a.name.trim().toLowerCase() === name.toLowerCase()
    )) {
      return setError("An account with this name already exists.");
    }

    try {
      const now = new Date().toISOString();

      await db.transaction(
        "rw",
        db.financialAccounts,
        db.financialTransactions,
        async () => {
          const accountId = await db.financialAccounts.add({
            name,
            type: accountForm.type,
            provider: accountForm.provider.trim(),
            createdAt: now
          });

          if (openingBalance > 0) {
            await db.financialTransactions.add({
              accountId,
              transactionType: "Opening Balance",
              category: "Opening balance",
              amount: openingBalance,
              description: "Initial account balance",
              transactionDate: today(),
              createdAt: now
            });
          }
        }
      );

      setAccountForm({
        name: "",
        type: "Cash",
        provider: "",
        openingBalance: "0"
      });

      setSuccess("Financial account created successfully.");
      await loadData();
    } catch (err) {
      setError("Could not create account: " + err.message);
    }
  }

  // QUICK CASH ACCOUNT CREATION FROM PAYMENTS
  async function createCashAccountFromPayments() {
    setError("");
    setSuccess("");

    try {
      const existing = financialAccounts.find(
        account => account.type === "Cash" &&
          account.name.trim().toLowerCase() === "cash in hand"
      );

      if (existing) {
        setPaymentForm(current => ({
          ...current,
          paymentMethod: "Cash",
          financialAccountId: String(existing.id)
        }));
        return;
      }

      const now = new Date().toISOString();

      const accountId = await db.financialAccounts.add({
        name: "Cash in Hand",
        type: "Cash",
        provider: "",
        createdAt: now
      });

      await loadData();

      setPaymentForm(current => ({
        ...current,
        paymentMethod: "Cash",
        financialAccountId: String(accountId)
      }));

      setSuccess("Cash in Hand account created and selected successfully.");
    } catch (err) {
      setError("Could not create Cash in Hand account: " + err.message);
    }
  }
  // PRODUCTS
  function updateField(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

    async function addProduct(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const buying = parseFloat(form.buyingPrice);
    const selling = parseFloat(form.sellingPrice);
    const quantity = parseInt(form.quantity, 10);

    if (!form.name.trim() || isNaN(buying) || buying <= 0 || isNaN(selling) || selling <= 0 || isNaN(quantity) || quantity < 0) {
      setError("Enter a product name, valid buying price, selling price and stock quantity.");
      return;
    }

    try {
      if (editingProductId !== null) {
        await db.products.update(editingProductId, {
          name: form.name.trim(),
          category: form.category.trim(),
          sku: form.sku.trim(),
          buyingPrice: buying,
          sellingPrice: selling
        });

        setEditingProductId(null);
        setSuccess("Product details updated. Stock history preserved.");
      } else {
        await db.transaction("rw", db.products, db.stockBatches, async () => {
          const now = new Date().toISOString();

          const productId = await db.products.add({
            name: form.name.trim(),
            category: form.category.trim(),
            sku: form.sku.trim(),
            buyingPrice: buying,
            sellingPrice: selling,
            quantity,
            createdAt: now
          });

          if (quantity > 0) {
            await db.stockBatches.add({
              productId,
              purchaseId: null,
              supplierName: "Opening stock",
              quantityReceived: quantity,
              quantityRemaining: quantity,
              unitCost: buying,
              purchaseDate: today(),
              createdAt: now,
              location: "Main Shop",
              batchType: "Opening stock"
            });
          }
        });

        setSuccess("Product saved successfully.");
      }

      setForm({
        name: "",
        category: "",
        sku: "",
        buyingPrice: "",
        sellingPrice: "",
        quantity: ""
      });

      setShowForm(false);
      await loadData();
    } catch (err) {
      setError("Could not save product: " + err.message);
    }
  }

  function startEditProduct(product) {
    setEditingProductId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      sku: product.sku || "",
      buyingPrice: String(product.buyingPrice || ""),
      sellingPrice: String(product.sellingPrice || ""),
      quantity: String(product.quantity || 0)
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }
  function deleteProduct(id) {
    if (!navigator.onLine || cloudStatus !== "online") {
      setError("Connect to the internet before deleting a product.");
      return;
    }

    setPendingDeleteId(id);
    setDeleteEmail("");
    setDeletePassword("");
    setError("");
    setSuccess("");
  }

  async function confirmDeleteProduct(event) {
    event.preventDefault();

    if (pendingDeleteId === null || deleteBusy) return;

    if (!navigator.onLine || cloudStatus !== "online") {
      setError("Internet connection is required for owner verification.");
      return;
    }

    setDeleteBusy(true);
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: deleteEmail.trim(),
          password: deletePassword
        });

      if (authError) {
        throw new Error("Owner email or password is incorrect.");
      }

      if (
        authData.user?.email?.toLowerCase() !== "friendnew@gmail.com"
      ) {
        await supabase.auth.signOut();
        throw new Error("Only the registered business owner can delete products.");
      }

      await db.products.update(pendingDeleteId, {
        deletedAt: new Date().toISOString()
      });

      setPendingDeleteId(null);
      setDeleteEmail("");
      setDeletePassword("");
      setSuccess("Product moved to Trash. Stock and sales history preserved.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not move product to Trash.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function cancelDeleteProduct() {
    if (deleteBusy) return;
    setPendingDeleteId(null);
    setDeleteEmail("");
    setDeletePassword("");
  }
  async function restoreProduct(id) {
    try {
      await db.products.update(id, { deletedAt: null });
      setSuccess("Product restored successfully. Stock and sales history preserved.");
      setError("");
      await loadData();
    } catch (err) {
      setError("Could not restore product: " + err.message);
    }
  }
  // CUSTOMERS
  async function findOrCreateCustomer(name, phone) {
    const records = await db.customers.toArray();
    const normalizedPhone = phone.trim();

    let customer = records.find(item =>
      normalizedPhone
        ? item.phone === normalizedPhone
        : item.name.toLowerCase() === name.trim().toLowerCase()
    );

    if (!customer) {
      const id = await db.customers.add({
        name: name.trim(),
        phone: normalizedPhone,
        createdAt: new Date().toISOString()
      });
      customer = await db.customers.get(id);
    } else {
      await db.customers.update(customer.id, {
        name: name.trim(),
        phone: normalizedPhone || customer.phone
      });
    }

    return customer;
  }

  // Shop locations are discovered from stock batches and transfer history.
  // The product quantity remains the business-wide total; batches hold each shop's quantity.
  const normalizeLocation = location => String(location || "").trim().toLowerCase();

  const shopLocations = [...new Map([
    "Main Shop",
    "Second Shop",
    ...stockBatches.map(batch => batch.location || "Main Shop"),
    ...stockTransfers.flatMap(transfer => [transfer.fromLocation, transfer.toLocation])
  ]
    .map(location => String(location || "").trim())
    .filter(Boolean)
    .map(location => [normalizeLocation(location), location])
  ).values()];

  function getShopStock(productId, location) {
    return stockBatches
      .filter(batch =>
        batch.productId === productId &&
        normalizeLocation(batch.location || "Main Shop") === normalizeLocation(location)
      )
      .reduce((sum, batch) => sum + Number(batch.quantityRemaining || 0), 0);
  }

  // SALES
  const selectedProduct = products.find(
    p => String(p.id) === saleForm.productId
  );

  const saleQuantity = Number(saleForm.quantity) || 0;

  const saleTotal = selectedProduct ? Number(saleForm.sellingPrice) * saleQuantity : 0;

  // Cash sales are paid in full. Credit and layaway sales may be paid partially.
  const amountPaid = saleForm.saleType === "Cash Sale"
    ? saleTotal
    : Math.max(0, Number(saleForm.amountPaid) || 0);
  const remainingBalance = Math.max(0, saleTotal - amountPaid);

  function calculateFifoPreview(productId, quantity) {
    const batches = stockBatches
      .filter(b =>
        b.productId === productId &&
        normalizeLocation(b.location || "Main Shop") === normalizeLocation(saleForm.location || "Main Shop") &&
        Number(b.quantityRemaining || 0) > 0
      )
      .sort((a, b) =>
        String(a.purchaseDate).localeCompare(String(b.purchaseDate)) ||
        a.id - b.id
      );

    let remaining = quantity;
    let cost = 0;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const taken = Math.min(
        remaining,
        Number(batch.quantityRemaining || 0)
      );

      cost += taken * Number(batch.unitCost || 0);
      remaining -= taken;
    }

    return { cost, available: remaining === 0 };
  }

  const fifoPreview = selectedProduct
    ? calculateFifoPreview(selectedProduct.id, saleQuantity)
    : { cost: 0, available: false };

  const saleProfit = saleTotal - fifoPreview.cost;

  async function recordSale(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedProduct) return setError("This item is not registered in available stock. Select an item from the suggestions.");
    if (!Number.isInteger(saleQuantity) || saleQuantity <= 0)
      return setError("Enter a valid quantity.");
    if (!Number.isFinite(Number(saleForm.sellingPrice)) || Number(saleForm.sellingPrice) <= 0)
      return setError("Enter a valid selling price.");
    if (!fifoPreview.available)
      return setError("There is not enough stock in " + (saleForm.location || "Main Shop") + ".");
    if (!["Cash Sale", "Credit Sale", "Layaway"].includes(saleForm.saleType))
      return setError("Choose a valid sale type.");
    if (saleForm.saleType !== "Cash Sale" && !saleForm.customerName.trim())
      return setError("Enter the customer's name for a credit or installment transaction.");
    if (amountPaid > saleTotal)
      return setError("The initial payment cannot exceed the sale total.");

    const receivingAccount = amountPaid > 0
      ? financialAccounts.find(account =>
          String(account.id) === String(saleForm.financialAccountId)
        )
      : null;

    if (amountPaid > 0 && !receivingAccount)
      return setError("Choose the account receiving the customer's payment.");
    if (receivingAccount && receivingAccount.type !== saleForm.paymentMethod)
      return setError("The selected account does not match the payment method.");

    try {
      const receiptNumber = "SB-" + Date.now();
      const now = new Date().toISOString();

      await db.transaction(
        "rw",
        db.products, db.sales, db.customers,
        db.payments, db.stockBatches,
        db.financialAccounts, db.financialTransactions,
        async () => {
          const product = await db.products.get(selectedProduct.id);

          if (!product || Number(product.quantity || 0) < saleQuantity)
            throw new Error("Business-wide stock changed. Refresh and try again.");

          const batches = await db.stockBatches
            .where("productId").equals(product.id).toArray();

          const availableBatches = batches
            .filter(b =>
              normalizeLocation(b.location || "Main Shop") === normalizeLocation(saleForm.location || "Main Shop") &&
              Number(b.quantityRemaining || 0) > 0
            )
            .sort((a, b) =>
              String(a.purchaseDate).localeCompare(String(b.purchaseDate)) ||
              a.id - b.id
            );

          let remainingToDeduct = saleQuantity;
          let costOfGoods = 0;
          const stockAllocations = [];

          for (const batch of availableBatches) {
            if (remainingToDeduct <= 0) break;

            const batchQuantity = Number(batch.quantityRemaining || 0);
            const quantityTaken = Math.min(
              remainingToDeduct, batchQuantity
            );

            if (quantityTaken <= 0) continue;

            const unitCost = Number(batch.unitCost || 0);
            costOfGoods += quantityTaken * unitCost;

            await db.stockBatches.update(batch.id, {
              quantityRemaining: batchQuantity - quantityTaken
            });

            stockAllocations.push({
              batchId: batch.id,
              quantity: quantityTaken,
              unitCost
            });

            remainingToDeduct -= quantityTaken;
          }

          if (remainingToDeduct > 0) {
            throw new Error("FIFO batches do not contain enough stock.");
          }

          const customer = await findOrCreateCustomer(
            saleForm.customerName,
            saleForm.customerPhone
          );

          const total = Number(saleForm.sellingPrice) * saleQuantity;
          const balance = total - amountPaid;

          await db.products.update(product.id, {
            quantity: Number(product.quantity) - saleQuantity
          });

          const saleId = await db.sales.add({
            receiptNumber,
            customerId: customer.id,
            customerName: saleForm.customerName.trim() || "Walk-in Customer",
            customerPhone: saleForm.customerPhone.trim(),
            productId: product.id,
            productName: product.name,
            location: String(saleForm.location || "Main Shop").trim(),
            quantity: saleQuantity,
            buyingPrice: costOfGoods / saleQuantity,
            sellingPrice: Number(saleForm.sellingPrice),
            total,
            costOfGoods,
            grossProfit: total - costOfGoods,
            stockAllocations,
            amountPaid,
            balance,
            saleType: saleForm.saleType,
            dueDate: saleForm.dueDate || null,
            fulfillmentStatus: saleForm.saleType === "Layaway"
              ? (remainingBalance <= 0 ? "Ready for collection" : "Awaiting full payment")
              : "Collected",
            paymentStatus: remainingBalance <= 0 ? "Paid" : "Partially Paid",
            paymentMethod: saleForm.paymentMethod,
            createdAt: now
          });

          // Deduct stock when the customer receives goods on credit; do not wait for installments.
          if (amountPaid > 0) {
            await db.payments.add({
              customerId: customer.id,
              saleId,
              receiptNumber,
              customerName: saleForm.customerName.trim() || "Walk-in Customer",
              amount: amountPaid,
              paymentMethod: saleForm.paymentMethod,
              paymentType: "Sale payment",
              createdAt: now
            });

            if (receivingAccount) await db.financialTransactions.add({
              accountId: receivingAccount.id,
              transactionType: "Income",
              category: "Customer Payment",
              referenceId: saleId,
              amount: amountPaid,
              description: "Sale payment - " + receiptNumber,
              transactionDate: today(),
              createdAt: now
            });
          }
        }
      );

      setSaleForm(emptySale);
      setSaleFormOpen(false);
      setSuccess("Sale saved using FIFO costing. Receipt: " + receiptNumber);
      await loadData();
    } catch (err) {
      setError("Sale failed: " + err.message);
    }
  }

  // INSTALLMENT PAYMENTS
  const outstandingSales = sales.filter(
    s => Number(s.balance || 0) > 0
  );

  const selectedPaymentSale = sales.find(
    s => String(s.id) === paymentForm.saleId
  );

  async function recordPayment(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedPaymentSale)
      return setError("Choose a customer transaction.");

    const amount = Number(paymentForm.amount);

    if (!Number.isFinite(amount) || amount <= 0 ||
        amount > Number(selectedPaymentSale.balance || 0))
      return setError("Enter a valid payment not exceeding the balance.");

    const receivingAccount = financialAccounts.find(
      account => String(account.id) === String(paymentForm.financialAccountId)
    );

    if (!receivingAccount)
      return setError("Choose the account receiving this payment.");

    if (receivingAccount.type !== paymentForm.paymentMethod)
      return setError("The selected account does not match the payment method.");

    try {
      const now = new Date().toISOString();

      await db.transaction(
        "rw",
        db.sales, db.payments,
        db.financialAccounts, db.financialTransactions,
        async () => {
        const sale = await db.sales.get(selectedPaymentSale.id);

        if (!sale || Number(sale.balance || 0) < amount)
          throw new Error("Balance changed. Refresh and try again.");

        const newPaid = Number(sale.amountPaid || 0) + amount;
        const newBalance = Number(sale.total || 0) - newPaid;
        const fullyPaid = newBalance <= 0;

        await db.sales.update(sale.id, {
          amountPaid: newPaid,
          balance: Math.max(0, newBalance),
          paymentStatus: fullyPaid ? "Paid" : "Partially Paid",
          fulfillmentStatus:
            sale.saleType === "Layaway" && fullyPaid
              ? "Ready for collection"
              : sale.fulfillmentStatus || "Collected"
        });

        await db.payments.add({
          customerId: sale.customerId,
          saleId: sale.id,
          receiptNumber: sale.receiptNumber,
          customerName: sale.customerName,
          amount,
          paymentMethod: paymentForm.paymentMethod,
          paymentType: "Installment payment",
          createdAt: now
        });

        await db.financialTransactions.add({
          accountId: receivingAccount.id,
          transactionType: "Income",
          category: "Customer Payment",
          referenceId: sale.id,
          amount,
          description: "Installment payment - " + sale.receiptNumber,
          transactionDate: today(),
          createdAt: now
        });
      });

      setPaymentForm({
        saleId: "", amount: "", paymentMethod: "Cash", financialAccountId: ""
      });
      setSuccess("Customer payment recorded.");
      await loadData();
    } catch (err) {
      setError("Payment failed: " + err.message);
    }
  }

  async function markCollected(sale) {
    if (Number(sale.balance || 0) > 0)
      return setError("Complete payment before collection.");
    if (sale.saleType !== "Layaway")
      return setError("This is not a layaway transaction.");

    try {
      await db.sales.update(sale.id, {
        fulfillmentStatus: "Collected",
        collectedAt: new Date().toISOString()
      });
      setSuccess("Product collection confirmed.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  // EXPENSES
  async function recordExpense(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const amount = Number(expenseForm.amount);

    if (!expenseForm.description.trim() ||
        !Number.isFinite(amount) || amount <= 0 || !expenseForm.date)
      return setError("Enter a description, valid amount and date.");

    try {
      await db.expenses.add({
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount,
        paymentMethod: expenseForm.paymentMethod,
        expenseDate: expenseForm.date,
        createdAt: new Date().toISOString()
      });

      setExpenseForm(emptyExpense);
      setSuccess("Expense recorded.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    await deleteWithSync("expenses", id);
    setSuccess("Expense deleted.");
    await loadData();
  }

  // BANKING
  async function recordBankTransaction(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const amount = Number(bankForm.amount);
    const accountName = bankForm.accountName.trim();

    if (!accountName || !Number.isFinite(amount) ||
        amount <= 0 || !bankForm.transactionDate)
      return setError("Enter the account, valid amount and date.");

    const financialAccount = financialAccounts.find(
      account =>
        account.type === "Bank" &&
        account.name.trim().toLowerCase() === accountName.toLowerCase()
    );

    if (!financialAccount)
      return setError("Create this Bank account in Financial Management first, using the same account name.");

    try {
      await db.transaction(
        "rw",
        db.bankTransactions,
        db.financialAccounts,
        db.financialTransactions,
        async () => {
          const now = new Date().toISOString();

          const bankTransactionId = await db.bankTransactions.add({
            ...bankForm,
            accountName,
            amount,
            description: bankForm.description.trim(),
            createdAt: now
          });

          await db.financialTransactions.add({
            accountId: financialAccount.id,
            transactionType: bankForm.transactionType,
            category: "Bank " + bankForm.transactionType,
            referenceId: bankTransactionId,
            amount,
            description: bankForm.description.trim() || "Bank " + bankForm.transactionType,
            transactionDate: bankForm.transactionDate,
            createdAt: now
          });
        }
      );

      setBankForm(emptyBank);
      setSuccess("Bank transaction recorded and Financial Management updated.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteBankTransaction(id) {
    if (!window.confirm("Delete this bank transaction?")) return;
    await deleteWithSync("bankTransactions", id);
    setSuccess("Bank transaction deleted.");
    await loadData();
  }

  const totalDeposits = bankTransactions
    .filter(t => t.transactionType === "Deposit")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalWithdrawals = bankTransactions
    .filter(t => t.transactionType === "Withdrawal")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalBankBalance = totalDeposits - totalWithdrawals;

  const bankAccountNames = [...new Set(
    bankTransactions.map(t => t.accountName)
  )];

  const bankAccountBalances = bankAccountNames.map(accountName => {
    const records = bankTransactions.filter(
      t => t.accountName === accountName
    );

    const deposits = records
      .filter(t => t.transactionType === "Deposit")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const withdrawals = records
      .filter(t => t.transactionType === "Withdrawal")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return {
      accountName, deposits, withdrawals,
      balance: deposits - withdrawals
    };
  });

  // STOCK PURCHASES - MULTI-ITEM DELIVERY
  const purchaseTotal = purchaseItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.buyingPrice || 0),
    0
  );

  function updatePurchaseItem(index, field, value) {
    setPurchaseItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };

      if (field === "productName") {
        const matchedProduct = products.find(
          product => product.name.trim().toLowerCase() === value.trim().toLowerCase()
        );
        updated.productId = matchedProduct ? String(matchedProduct.id) : "";
        if (matchedProduct) {
          updated.buyingPrice = String(matchedProduct.buyingPrice || "");
          
        } else if (item.productId) {
          updated.buyingPrice = "";
          updated.sellingPrice = "";
        }
      }

      return updated;
    }));
  }

  function addPurchaseItem() {
    setPurchaseItems(items => [...items, {
      productId: "", productName: "", quantity: "", buyingPrice: "", sellingPrice: ""
    }]);
  }

  function removePurchaseItem(index) {
    setPurchaseItems(items => items.filter((_, i) => i !== index));
  }

  async function recordStockPurchase(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!purchaseForm.supplierName.trim()) return setError("Enter supplier name.");
    if (!purchaseForm.purchaseDate) return setError("Choose a purchase date.");
    if (!String(purchaseForm.location || "").trim()) return setError("Enter the shop receiving this stock.");
    if (!purchaseItems.length) return setError("Add at least one product.");

    const seenProducts = new Set();
    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i];
      const productName = String(item.productName || "").trim();
      const productKey = productName.toLowerCase();
      if (!productName) return setError("Enter a product name on item " + (i + 1) + ".");
      if (seenProducts.has(productKey)) return setError("Each product should appear only once. Combine its quantity on item " + (i + 1) + ".");
      seenProducts.add(productKey);
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)
        return setError("Enter a valid whole-number quantity for item " + (i + 1) + ".");
      if (!Number.isFinite(Number(item.buyingPrice)) || Number(item.buyingPrice) <= 0)
        return setError("Enter a valid buying price for item " + (i + 1) + ".");
      if (!Number.isFinite(Number(item.sellingPrice)) || Number(item.sellingPrice) <= 0)
        return setError("Enter a valid selling price for item " + (i + 1) + ".");
      
    }

    const payingAccount = purchaseForm.paymentMethod === "Credit"
      ? null
      : financialAccounts.find(account => String(account.id) === String(purchaseForm.financialAccountId));

    if (purchaseForm.paymentMethod !== "Credit" && purchaseForm.paymentMethod !== "Cash" && !payingAccount)
      return setError("Choose the account paying for this stock.");
    if (payingAccount && payingAccount.type !== purchaseForm.paymentMethod)
      return setError("The selected account does not match the payment method.");

    try {
      await db.transaction(
        "rw",
        db.products, db.stockPurchases, db.stockBatches,
        db.financialAccounts, db.financialTransactions,
        async () => {
          const now = new Date().toISOString();
          for (const item of purchaseItems) {
            const productName = String(item.productName || "").trim();
            let product = item.productId
              ? await db.products.get(Number(item.productId))
              : null;

            if (product?.deletedAt) product = null;

            if (!product) {
              const allProducts = await db.products.toArray();
              product = allProducts.find(existing =>
                !existing.deletedAt &&
                String(existing.name || "").trim().toLowerCase() === productName.toLowerCase()
              ) || null;
            }

            const quantity = Number(item.quantity);
            const buyingPrice = Number(item.buyingPrice);
            

            if (!product) {
              const newProductId = await db.products.add({
                name: productName,
                category: "",
                sku: "",
                buyingPrice,
                sellingPrice: Number(item.sellingPrice),
                quantity: 0,
                createdAt: now
              });
              product = await db.products.get(newProductId);
            }

            if (!product) throw new Error("Could not create or find product: " + productName);

            const lineTotal = quantity * buyingPrice;

            const purchaseId = await db.stockPurchases.add({
              productId: product.id,
              productName: product.name,
              supplierName: purchaseForm.supplierName.trim(),
              quantity,
              buyingPrice,
              total: lineTotal,
              purchaseDate: purchaseForm.purchaseDate,
              paymentMethod: purchaseForm.paymentMethod,
              location: String(purchaseForm.location || "Main Shop").trim(),
              financialAccountId: payingAccount?.id || null,
              paymentStatus: purchaseForm.paymentMethod === "Credit" ? "Unpaid" : "Paid",
              createdAt: now
            });

            await db.stockBatches.add({
              productId: product.id,
              purchaseId,
              supplierName: purchaseForm.supplierName.trim(),
              quantityReceived: quantity,
              quantityRemaining: quantity,
              unitCost: buyingPrice,
              purchaseDate: purchaseForm.purchaseDate,
              createdAt: now,
              location: String(purchaseForm.location || "Main Shop").trim(),
              batchType: "Stock purchase"
            });

            await db.products.update(product.id, {
              quantity: Number(product.quantity || 0) + quantity,
              buyingPrice,
              sellingPrice
            });

            if (payingAccount) {
              await db.financialTransactions.add({
                accountId: payingAccount.id,
                transactionType: "Stock Purchase",
                category: "Stock Purchase",
                referenceId: purchaseId,
                amount: lineTotal,
                description: "Stock purchased from " + purchaseForm.supplierName.trim() + " - " + product.name,
                transactionDate: purchaseForm.purchaseDate,
                createdAt: now
              });
            }
          }
        }
      );

      setPurchaseForm(emptyPurchase);
      setPurchaseItems([{
        productId: "", productName: "", quantity: "", buyingPrice: "", sellingPrice: ""
      }]);
      setSuccess("All stock items saved successfully. Each item has its own FIFO batch and purchase record.");
      await loadData();
    } catch (err) {
      setError("Purchase failed: " + err.message);
    }
  }

  async function recordStockTransfer(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const productId = Number(transferForm.productId);
    const quantity = Number(transferForm.quantity);
    const fromLocation = String(transferForm.fromLocation || "").trim();
    const toLocation = String(transferForm.toLocation || "").trim();

    const product = products.find(p => p.id === productId);

    if (!product) return setError("Select a product.");
    if (!Number.isInteger(quantity) || quantity <= 0)
      return setError("Enter a valid whole-number quantity.");
    if (!fromLocation || !toLocation)
      return setError("Enter both the sending shop and receiving shop.");
    if (fromLocation.toLowerCase() === toLocation.toLowerCase())
      return setError("The sending shop and receiving shop must be different.");
    if (!transferForm.transferDate)
      return setError("Choose a transfer date.");

    try {
      await db.transaction(
        "rw",
        db.stockBatches,
        db.stockTransfers,
        async () => {
          const batches = await db.stockBatches
            .where("productId")
            .equals(productId)
            .toArray();

          const availableBatches = batches
            .filter(b =>
              normalizeLocation(b.location || "Main Shop") === normalizeLocation(fromLocation) &&
              Number(b.quantityRemaining || 0) > 0
            )
            .sort((a, b) =>
              String(a.purchaseDate).localeCompare(String(b.purchaseDate)) ||
              a.id - b.id
            );

          const available = availableBatches.reduce(
            (sum, batch) => sum + Number(batch.quantityRemaining || 0),
            0
          );

          if (available < quantity) {
            throw new Error(
              "Only " + available + " units are available in " + fromLocation + "."
            );
          }

          const now = new Date().toISOString();

          const transferId = await db.stockTransfers.add({
            productId,
            productName: product.name,
            quantity,
            fromLocation,
            toLocation,
            transferDate: transferForm.transferDate,
            createdAt: now
          });

          let remaining = quantity;

          for (const batch of availableBatches) {
            if (remaining <= 0) break;

            const batchQuantity = Number(batch.quantityRemaining || 0);
            const moved = Math.min(remaining, batchQuantity);

            await db.stockBatches.update(batch.id, {
              quantityRemaining: batchQuantity - moved
            });

            await db.stockBatches.add({
              productId,
              purchaseId: batch.purchaseId || null,
              supplierName: batch.supplierName || "Transferred stock",
              quantityReceived: moved,
              quantityRemaining: moved,
              unitCost: Number(batch.unitCost || 0),
              purchaseDate: batch.purchaseDate || transferForm.transferDate,
              createdAt: now,
              batchType: "Stock transfer",
              location: toLocation,
              transferId
            });

            remaining -= moved;
          }
        }
      );

      setTransferForm({
        productId: "",
        quantity: "",
        fromLocation: "Main Shop",
        toLocation: "Second Shop",
        transferDate: new Date().toISOString().slice(0, 10)
      });

      setSuccess(quantity + " units of " + product.name + " transferred from " + fromLocation + " to " + toLocation + ". Both shop stock balances have been updated.");
      await loadData();
    } catch (err) {
      setError("Stock transfer failed: " + err.message);
    }
  }
  async function deleteStockPurchase(id) {
    if (!window.confirm(
      "Delete this purchase record? This will NOT reverse stock or remove its FIFO batch."
    )) return;

    try {
      await deleteWithSync("stockPurchases", id);
      setSuccess("Purchase history record deleted. Stock was not changed.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  // TOTALS
  const totalProducts = products.length;

  const totalUnits = products.reduce(
    (sum, p) => sum + Number(p.quantity || 0), 0
  );

  const inStockProducts = products.filter(
    p => Number(p.quantity || 0) > 5
  );

  const lowStockProducts = products.filter(
    p => Number(p.quantity || 0) > 0 && Number(p.quantity || 0) <= 5
  );

  const outOfStockProducts = products.filter(
    p => Number(p.quantity || 0) <= 0
  );

  const filteredStockProducts = products.filter(p => {
    const quantity = Number(p.quantity || 0);
    const search = stockSearch.trim().toLowerCase();

    const matchesSearch =
      String(p.name || "").toLowerCase().includes(search) ||
      String(p.category || "").toLowerCase().includes(search) ||
      String(p.sku || "").toLowerCase().includes(search);

    const matchesFilter =
      stockFilter === "All" ||
      (stockFilter === "In Stock" && quantity > 5) ||
      (stockFilter === "Low Stock" && quantity > 0 && quantity <= 5) ||
      (stockFilter === "Out of Stock" && quantity <= 0);

    return matchesSearch && matchesFilter;
  });

  // Total value of actual available stock, calculated using FIFO purchase costs.
  const totalStockCost = products.reduce(
    (sum, product) => sum + getProductStockValue(product.id),
    0
  );

  const totalSales = sales.reduce(
    (sum, s) => sum + Number(s.total || 0), 0
  );

  const totalProfit = sales.reduce(
    (sum, s) => sum + Number(s.grossProfit || 0), 0
  );

  const totalOutstanding = sales.reduce(
    (sum, s) => sum + Number(s.balance || 0), 0
  );

  const totalReceived = sales.reduce(
    (sum, s) => sum + Number(s.amountPaid || 0), 0
  );

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0), 0
  );

  const netProfit = totalProfit - totalExpenses;

  const totalLayaway = sales
    .filter(s => s.saleType === "Layaway")
    .reduce((sum, s) => sum + Number(s.balance || 0), 0);

  const totalCredit = sales
    .filter(s => s.saleType === "Credit Sale")
    .reduce((sum, s) => sum + Number(s.balance || 0), 0);

  const totalStockPurchases = stockPurchases.reduce(
    (sum, p) => sum + Number(p.total || 0), 0
  );

  // REPORTS
  const reportToday = today();

  function reportDateIsIncluded(value) {
    if (!value) return false;
    const date = String(value).slice(0, 10);

    if (reportPeriod === "today") return date === reportToday;
    if (reportPeriod === "month") return date.startsWith(reportToday.slice(0, 7));
    if (reportPeriod === "year") return date.startsWith(reportToday.slice(0, 4));

    if (reportPeriod === "week") {
      const start = new Date(reportToday + "T00:00:00");
      start.setDate(start.getDate() - 6);
      const startText = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        String(start.getDate()).padStart(2, "0")
      ].join("-");
      return date >= startText && date <= reportToday;
    }

    return true;
  }

  const reportSales = sales.filter(s => reportDateIsIncluded(s.createdAt));
  const reportPayments = payments.filter(p => reportDateIsIncluded(p.createdAt));
  const reportExpenses = expenses.filter(e =>
    reportDateIsIncluded(e.date || e.expenseDate || e.createdAt)
  );
  const reportPurchases = stockPurchases.filter(p =>
    reportDateIsIncluded(p.purchaseDate || p.createdAt)
  );

  const reportSalesTotal = reportSales.reduce(
    (sum, s) => sum + Number(s.total || 0), 0
  );
  const reportReceived = reportPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0), 0
  );
  const reportGrossProfit = reportSales.reduce(
    (sum, s) => sum + Number(s.grossProfit || 0), 0
  );
  const reportExpenseTotal = reportExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0), 0
  );
  const reportPurchaseTotal = reportPurchases.reduce(
    (sum, p) => sum + Number(p.total || 0), 0
  );
  const reportStockInUnits = reportPurchases.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
  const reportStockSoldUnits = reportSales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
  const reportNetProfit = reportGrossProfit - reportExpenseTotal;

  // Current outstanding debts, regardless of report date.
  const reportOutstanding = sales.reduce(
    (sum, s) => sum + Math.max(
      0,
      Number(s.total || 0) - Number(s.amountPaid || 0)
    ),
    0
  );

  const reportPaymentMethods = Object.values(
    reportPayments.reduce((groups, payment) => {
      const method = payment.paymentMethod || "Other";
      if (!groups[method]) groups[method] = { method, amount: 0 };
      groups[method].amount += Number(payment.amount || 0);
      return groups;
    }, {})
  );

  const reportBestSellers = Object.values(
    reportSales.reduce((groups, sale) => {
      const name = sale.productName || "Unknown product";
      if (!groups[name]) groups[name] = { name, quantity: 0, total: 0 };
      groups[name].quantity += Number(sale.quantity || 0);
      groups[name].total += Number(sale.total || 0);
      return groups;
    }, {})
  ).sort((a, b) => b.quantity - a.quantity);
  function navigate(page) {
    setActivePage(page);
    setError("");
    setSuccess("");
    setSelectedReceipt(null);
  }

  function printReceipt() {
    if (selectedReceipt) window.print();
  }

  const selectedReceiptPayments = selectedReceipt
    ? payments.filter(p => p.saleId === selectedReceipt.id)
    : [];

  // Value only the quantity recorded as currently available for this product.
  function getProductStockValue(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;

    let quantityToValue = Math.max(0, Number(product.quantity || 0));
    let value = 0;

    const batches = stockBatches
      .filter(b => b.productId === productId && Number(b.quantityRemaining || 0) > 0)
      .slice()
      .sort((a, b) =>
        String(a.purchaseDate || "").localeCompare(String(b.purchaseDate || "")) ||
        Number(a.id || 0) - Number(b.id || 0)
      );

    for (const batch of batches) {
      if (quantityToValue <= 0) break;

      const quantity = Math.min(
        quantityToValue,
        Number(batch.quantityRemaining || 0)
      );

      value += quantity * Number(batch.unitCost || 0);
      quantityToValue -= quantity;
    }

    return value;
  }
  if (!authChecked) {
    return <div className="welcome-screen"><p>Checking sign-in…</p></div>;
  }

  if (!hasEntered) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <div className="welcome-logo"><span>SB</span></div>
          <p className="welcome-label">YOUR BUSINESS PARTNER</p>
          <h1>SmartBiz Manager</h1>
          <h2>Manage your business smarter.</h2>
          <p className="welcome-description">
            Manage your sales, stock, customers, expenses and finances in one place.
          </p>
          <div className="welcome-features">
            <div>✓ Sales and receipts</div>
            <div>✓ Stock and inventory</div>
            <div>✓ Expenses and banking</div>
            <div>✓ Business reports</div>
          </div>
          <button
            className="welcome-start-button"
            onClick={() => {
              localStorage.setItem("smartbiz-welcome-complete", "true");
              setHasEntered(true);
            }}
          >
            Get Started →
          </button>
          <p className="welcome-footer">Your business. Your control.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <h1>SmartBiz Manager</h1>
          <h2>Sign in to your business</h2>
          <p className="welcome-description">
            Use the same email and password as your computer.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthBusy(true);
              setError("");
              const { error } = await supabase.auth.signInWithPassword({
                email: authEmail.trim(),
                password: authPassword,
              });
              setAuthBusy(false);
              if (error) setError("Sign-in failed: " + error.message);
            }}
            style={{ display: "grid", gap: "12px", maxWidth: 360, margin: "0 auto" }}
          >
            <input type="email" placeholder="Email" required
              value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
            <input type="password" placeholder="Password" required
              value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
            <button className="welcome-start-button" disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign In →"}
            </button>
            {error && <p className="error-message">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h2>SmartBiz</h2>
          <p className="subtitle">Business Manager</p>
        </div>

        <nav>
          {menu.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                className={`nav-item ${activePage === item.name ? "active" : ""}`}
                onClick={() => navigate(item.name)}
              >
                <Icon size={19} /> {item.name}
              </button>
            );
          })}
        </nav>
      </aside>

      <nav className="mobile-bottom-nav">
        {menu.slice(0, 4).map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              className={`mobile-nav-item ${activePage === item.name ? "active" : ""}`}
              onClick={() => {
                navigate(item.name);
                setShowMoreMenu(false);
              }}
            >
              <Icon size={21} />
              <span>{item.name}</span>
            </button>
          );
        })}
        <button
          className={`mobile-nav-item ${showMoreMenu ? "active" : ""}`}
          onClick={() => setShowMoreMenu(!showMoreMenu)}
        >
          <span className="more-symbol">•••</span>
          <span>More</span>
        </button>
      </nav>

      {showMoreMenu && (
        <div className="mobile-more-menu">
          {menu.slice(4).map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                className={`mobile-more-item ${activePage === item.name ? "active" : ""}`}
                onClick={() => {
                  navigate(item.name);
                  setShowMoreMenu(false);
                }}
              >
                <Icon size={19} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <main className="main">
        <header className="topbar">
          <div>
            <h2>{activePage}</h2>
            <p>SmartBiz Business Management System</p>
          </div>
          <div className="connection">
            <span
              className="online-dot"
              style={{
                backgroundColor: cloudStatus === "online" ? "#16a34a" :
                  cloudStatus === "offline" ? "#dc2626" : "#d97706"
              }}
            ></span>
            {cloudStatus === "online" ? "ONLINE" :
              cloudStatus === "offline" ? "OFFLINE" : "CHECKING..."}
          </div>
        </header>

        <section className="content">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          {loading && <p>Loading business records...</p>}

          {/* DASHBOARD */}
          {activePage === "Dashboard" && !loading && (
            <>
              <h2>Business Overview</h2>
              <p className="muted">Your business performance.</p>

              <div className="cards">
                <div className="card"><p>Total Sales</p><h2>{money(totalSales)}</h2></div>
                <div className="card"><p>Money Received</p><h2 className="profit">{money(totalReceived)}</h2></div>
                <div className="card"><p>Gross Profit</p><h2 className="profit">{money(totalProfit)}</h2></div>
                <div className="card"><p>Customer Debts</p><h2 className="debt">{money(totalOutstanding)}</h2></div>
              </div>

              <div className="cards">
                <div className="card"><p>Total Expenses</p><h2 className="debt">{money(totalExpenses)}</h2></div>
                <div className="card"><p>Net Profit After Expenses</p><h2 className={netProfit >= 0 ? "profit" : "debt"}>{money(netProfit)}</h2></div>
                <div className="card"><p>Credit Balances</p><h2>{money(totalCredit)}</h2></div>
                <div className="card"><p>Layaway Balances</p><h2>{money(totalLayaway)}</h2></div>
              </div>

              <div className="cards">
                <div className="card"><p>Bank Balance</p><h2 className="profit">{money(totalBankBalance)}</h2></div>
                <div className="card"><p>Bank Deposits</p><h2>{money(totalDeposits)}</h2></div>
                <div className="card"><p>Bank Withdrawals</p><h2>{money(totalWithdrawals)}</h2></div>
                <div className="card"><p>Stock Purchases</p><h2>{money(totalStockPurchases)}</h2></div>
              </div>

              <div className="welcome-card">
                <h2>SmartBiz Manager</h2>
                <p>Registered products: {totalProducts}</p>
                <p>Available stock units: {totalUnits}</p>
                <p>Recorded sales: {sales.length}</p>
                <p>Registered customers: {customers.length}</p>
                <p>Recorded expenses: {expenses.length}</p>
                <p>Banking transactions: {bankTransactions.length}</p>
                <p>Stock value: {money(totalStockCost)}</p>
                <button className="primary-button" onClick={() => navigate("Sales")}>
                  <ShoppingCart size={17} /> Record a Sale
                </button>
              </div>
            </>
          )}

          {/* PRODUCTS */}
          {activePage === "Products" && (
            <>
              <div className="page-heading">
                <div>
                  <h2>Product Management</h2>
                  <p className="muted">Register and manage products.</p>
                </div>
                <button className="primary-button" onClick={() => setShowForm(!showForm)}>
                  <Plus size={18} /> Add Product
                </button>
              </div>

              {showForm && (
                <form className="product-form" onSubmit={addProduct}>
                  <h3>{editingProductId !== null ? "Edit Product" : "Register New Product"}</h3>
                  <div className="form-grid">
                    <label>Product name *<input name="name" value={form.name} onChange={updateField} required /></label>
                    <label>Category<input name="category" value={form.category} onChange={updateField} /></label>
                    <label>Product code<input name="sku" value={form.sku} onChange={updateField} /></label>
                    <label>Buying price (UGX) *<input type="number" min="1" name="buyingPrice" value={form.buyingPrice} onChange={updateField} required /></label>
                    <label>Quantity *<input type="number" min="0" step="1" name="quantity" value={form.quantity} onChange={updateField} required /></label>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
                    <button className="primary-button">{editingProductId !== null ? "Update Product" : "Save Product"}</button>
                  </div>
                </form>
              )}

              <div className="table-card">
                <div className="table-heading">
                  <h3>Registered Products</h3>
                  <button className="refresh-button" onClick={loadData}><RefreshCw size={16} /> Refresh</button>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Buying price</th>
                        <th>Quantity</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong><small>{p.category}</small></td>
                          <td>{money(p.buyingPrice)}</td>
                          <td>{p.quantity}</td>
                          <td>
                            <button className="secondary-button" onClick={() => startEditProduct(p)}>
                              Edit
                            </button>
                            <button className="delete-button" onClick={() => deleteProduct(p.id)}>
                              <Trash2 size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {products.length === 0 && <p>No products registered.</p>}
                </div>
              </div>
            </>
          )}

          {/* SALES */}
          {activePage === "Sales" && (
            <>
              <h2>Sales Management</h2>
              <p className="muted">Cash sales, credit sales and layaway transactions.</p>

              {saleFormOpen ? (
              <form className="product-form" onSubmit={recordSale}>
                <h3>New Sales Transaction</h3>

                <div className="form-grid">
                  <label>Shop serving this customer *
                    <select
                      value={saleForm.location || "Main Shop"}
                      onChange={e => setSaleForm({ ...saleForm, location: e.target.value, productId: "" })}
                      required
                    >
                      {shopLocations.map(location => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </label>

                  <label>Items *
                    <select value={saleForm.productId} onChange={e => {
                      const selectedId = e.target.value;
                      const match = products.find(p => String(p.id) === selectedId);
                      
                      setSaleForm({
                        ...saleForm,
                        productId: selectedId,
                        sellingPrice: match && match.sellingPrice ? String(match.sellingPrice) : ""
                      });
                      setError("");
                    }} required>
                      <option value="">Search and select an item from available stock...</option>
                      {products.filter(p => getShopStock(p.id, saleForm.location || "Main Shop") > 0).map(p => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name}{p.sku ? " (" + p.sku + ")" : ""} — {saleForm.location || "Main Shop"} stock: {getShopStock(p.id, saleForm.location || "Main Shop")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Quantity *
                    <input type="number" min="1" step="1" value={saleForm.quantity} onChange={e => setSaleForm({ ...saleForm, quantity: e.target.value })} required />
                  </label>

                  <label>Selling price (UGX) *
                    <input type="number" min="1" step="1" value={saleForm.sellingPrice} onChange={e => setSaleForm({ ...saleForm, sellingPrice: e.target.value })} required />
                  </label>

                  <label>Customer name (Optional)
                    <input value={saleForm.customerName} onChange={e => setSaleForm({ ...saleForm, customerName: e.target.value })} />
                  </label>

                  <label>Customer phone (Optional)
                    <input value={saleForm.customerPhone} onChange={e => setSaleForm({ ...saleForm, customerPhone: e.target.value })} />
                  </label>

                  

                  <label>Sale type *
                    <select
                      value={saleForm.saleType}
                      onChange={e => setSaleForm({
                        ...saleForm,
                        saleType: e.target.value,
                        amountPaid: e.target.value === "Cash Sale" ? "" : saleForm.amountPaid,
                        financialAccountId: ""
                      })}
                      required
                    >
                      <option value="Cash Sale">Cash Sale — paid in full</option>
                      <option value="Credit Sale">Credit Sale — take goods now, pay in installments</option>
                      <option value="Layaway">Layaway — reserve goods until fully paid</option>
                    </select>
                  </label>

                  {saleForm.saleType !== "Cash Sale" && (
                    <>
                      <label>Initial amount paid (UGX)
                        <input
                          type="number"
                          min="0"
                          step="1"
                          max={saleTotal || undefined}
                          value={saleForm.amountPaid}
                          onChange={e => setSaleForm({ ...saleForm, amountPaid: e.target.value })}
                        />
                      </label>
                      <label>Payment due date
                        <input
                          type="date"
                          value={saleForm.dueDate}
                          onChange={e => setSaleForm({ ...saleForm, dueDate: e.target.value })}
                        />
                      </label>
                    </>
                  )}

                  {amountPaid > 0 && (
                    <>
                      <label>Payment method *
                        <select
                          value={saleForm.paymentMethod}
                          onChange={e => setSaleForm({
                            ...saleForm,
                            paymentMethod: e.target.value,
                            financialAccountId: ""
                          })}
                          required
                        >
                          <option>Cash</option>
                          <option>Bank</option>
                          <option>Mobile Money</option>
                          <option>Other</option>
                        </select>
                      </label>
                      <label>Receive payment into account *
                        <select
                          value={saleForm.financialAccountId}
                          onChange={e => setSaleForm({ ...saleForm, financialAccountId: e.target.value })}
                          required
                        >
                          <option value="">Choose receiving account</option>
                          {financialAccounts
                            .filter(account => account.type === saleForm.paymentMethod)
                            .map(account => (
                              <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>

                <div className="welcome-card">
                  <h3>Transaction information</h3>
                  {saleForm.saleType === "Cash Sale" && <p>The customer pays in full and takes the product.</p>}
                  {saleForm.saleType === "Credit Sale" && <p>The customer takes the product immediately. The unpaid amount becomes a debt.</p>}
                  {saleForm.saleType === "Layaway" && <p>The product is reserved until full payment.</p>}
                </div>

                <div className="sale-summary">
                  <div><span>Selling price</span><strong>{money(saleForm.sellingPrice)}</strong></div>
                  <div><span>Total sale</span><strong>{money(saleTotal)}</strong></div>
                  <div><span>FIFO stock cost</span><strong>{money(fifoPreview.cost)}</strong></div>
                  <div><span>Expected gross profit</span><strong className={saleProfit >= 0 ? "profit" : "debt"}>{money(saleProfit)}</strong></div>
                  <div><span>Amount paid</span><strong>{money(amountPaid)}</strong></div>
                  <div><span>Customer balance</span><strong className="debt">{money(remainingBalance)}</strong></div>
                </div>

                {selectedProduct && !fifoPreview.available && (
                  <div className="error-message">
                    FIFO batches do not contain enough stock for this sale.
                  </div>
                )}

                <div className="form-actions">
                  <button className="primary-button" disabled={!!selectedProduct && !fifoPreview.available}>
                    <ShoppingCart size={18} /> Save Transaction
                  </button>
                </div>
              </form>
              ) : (
                <div className="welcome-card">
                  <h3>Sale recorded successfully</h3>
                  <p>Your previous transaction has been saved. Start a fresh form for the next customer.</p>
                  <button type="button" className="primary-button" onClick={() => { setSaleForm(emptySale); setSaleFormOpen(true); setError(""); setSuccess(""); }}>
                    <Plus size={18} /> New Sale
                  </button>
                </div>
              )}


            </>
          )}

          {/* CUSTOMERS */}
          {activePage === "Customers" && (
            <>
              <h2>Customer Accounts</h2>
              <p className="muted">Customer records and outstanding balances.</p>

              <div className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th><th>Phone</th><th>Transactions</th>
                        <th>Total purchases</th><th>Amount paid</th><th>Outstanding debt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(c => {
                        const records = sales.filter(s => s.customerId === c.id);
                        return (
                          <tr key={c.id}>
                            <td>{c.name}</td>
                            <td>{c.phone || "—"}</td>
                            <td>{records.length}</td>
                            <td>{money(records.reduce((a, s) => a + Number(s.total || 0), 0))}</td>
                            <td>{money(records.reduce((a, s) => a + Number(s.amountPaid || 0), 0))}</td>
                            <td className="debt">{money(records.reduce((a, s) => a + Number(s.balance || 0), 0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {customers.length === 0 && <p>No customer accounts yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* CREDITORS */}
          {activePage === "Creditors" && (
            <>
              <h2>Creditors / Customers Who Owe the Business</h2>
              <p className="muted">
                Customers who received products on credit and still have an unpaid balance.
                Stock is deducted when the credit sale is recorded.
              </p>

              <div className="cards">
                <div className="card">
                  <p>Total credit outstanding</p>
                  <h2 className="debt">{money(totalCredit)}</h2>
                </div>
                <div className="card">
                  <p>Customers with outstanding credit</p>
                  <h2>{new Set(sales
                    .filter(s => s.saleType === "Credit Sale" && Number(s.balance || 0) > 0)
                    .map(s => s.customerId)).size}</h2>
                </div>
                <div className="card">
                  <p>Total received on credit sales</p>
                  <h2 className="profit">{money(sales
                    .filter(s => s.saleType === "Credit Sale")
                    .reduce((sum, s) => sum + Number(s.amountPaid || 0), 0))}</h2>
                </div>
              </div>

              <div className="table-card">
                <h3>Outstanding Creditors</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th><th>Phone</th><th>Product</th><th>Receipt</th>
                        <th>Total price</th><th>Paid</th><th>Amount owed</th><th>Due date</th><th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales
                        .filter(s => s.saleType === "Credit Sale" && Number(s.balance || 0) > 0)
                        .map(s => {
                          const customer = customers.find(c => c.id === s.customerId);
                          return (
                            <tr key={s.id}>
                              <td>{s.customerName || customer?.name || "Customer"}</td>
                              <td>{s.customerPhone || customer?.phone || "—"}</td>
                              <td>{s.productName} × {s.quantity}</td>
                              <td>{s.receiptNumber}</td>
                              <td>{money(s.total)}</td>
                              <td>{money(s.amountPaid)}</td>
                              <td className="debt">{money(s.balance)}</td>
                              <td>{s.dueDate || "—"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() => {
                                    setPaymentForm({
                                      saleId: String(s.id),
                                      amount: "",
                                      paymentMethod: "Cash",
                                      financialAccountId: ""
                                    });
                                    navigate("Payments");
                                  }}
                                >
                                  <CreditCard size={16} /> Receive payment
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {sales.filter(s => s.saleType === "Credit Sale" && Number(s.balance || 0) > 0).length === 0 && (
                    <p>No customers currently owe money on credit sales.</p>
                  )}
                </div>
              </div>

              <div className="table-card">
                <h3>Credit Sale History</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Product</th><th>Receipt</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {sales.filter(s => s.saleType === "Credit Sale").map(s => (
                        <tr key={s.id}>
                          <td>{s.customerName}</td>
                          <td>{s.productName} × {s.quantity}</td>
                          <td>{s.receiptNumber}</td>
                          <td>{money(s.total)}</td>
                          <td>{money(s.amountPaid)}</td>
                          <td className={Number(s.balance || 0) > 0 ? "debt" : "profit"}>{money(s.balance)}</td>
                          <td>{s.paymentStatus || (Number(s.balance || 0) <= 0 ? "Paid" : "Partially Paid")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sales.filter(s => s.saleType === "Credit Sale").length === 0 && <p>No credit sales recorded yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* PAYMENTS */}
          {activePage === "Payments" && (
            <>
              <h2>Customer Payments</h2>
              <p className="muted">Receive installments and manage customer balances.</p>

              <div className="cards">
                <div className="card"><p>Total outstanding</p><h2 className="debt">{money(totalOutstanding)}</h2></div>
                <div className="card"><p>Credit balances</p><h2>{money(totalCredit)}</h2></div>
                <div className="card"><p>Layaway balances</p><h2>{money(totalLayaway)}</h2></div>
              </div>

              <form className="product-form" onSubmit={recordPayment}>
                <h3>Record Customer Installment</h3>

                <div className="form-grid">
                  <label>Select transaction *
                    <select value={paymentForm.saleId} onChange={e => setPaymentForm({ ...paymentForm, saleId: e.target.value, amount: "" })} required>
                      <option value="">Choose customer transaction</option>
                      {outstandingSales.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.customerName} — {s.receiptNumber} — Balance: {money(s.balance)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>Outstanding balance
                    <input value={money(selectedPaymentSale?.balance)} readOnly />
                  </label>

                  <label>Payment amount (UGX) *
                    <input type="number" min="1" step="1" max={selectedPaymentSale?.balance || undefined} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
                  </label>

                  <label>Payment method
                    <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value, financialAccountId: "" })}>
                      <option>Cash</option><option>Bank</option><option>Mobile Money</option><option>Other</option>
                    </select>
                  </label>

                  <label>Receive installment into account *
                    <select
                      value={paymentForm.financialAccountId}
                      onChange={e => setPaymentForm({ ...paymentForm, financialAccountId: e.target.value })}
                      required
                    >
                      <option value="">Choose account</option>
                      {financialAccounts
                        .filter(account => account.type === paymentForm.paymentMethod)
                        .map(account => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                {paymentForm.paymentMethod === "Cash" &&
                  !financialAccounts.some(account => account.type === "Cash") && (
                    <div style={{ marginTop: "14px" }}>
                      <p className="muted">
                        No Cash account exists yet. Create one to receive this installment.
                      </p>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={createCashAccountFromPayments}
                      >
                        <Plus size={18} /> Create Cash in Hand Account
                      </button>
                    </div>
                  )}

                <div className="form-actions">
                  <button className="primary-button"><CreditCard size={18} /> Save Payment</button>
                </div>
              </form>

              <div className="table-card">
                <h3>Outstanding Transactions</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Receipt</th><th>Type</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due date</th><th>Collection</th></tr>
                    </thead>
                    <tbody>
                      {outstandingSales.map(s => (
                        <tr key={s.id}>
                          <td>{s.customerName}</td><td>{s.receiptNumber}</td><td>{s.saleType}</td>
                          <td>{money(s.total)}</td><td>{money(s.amountPaid)}</td>
                          <td className="debt">{money(s.balance)}</td><td>{s.dueDate || "—"}</td>
                          <td>{s.fulfillmentStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {outstandingSales.length === 0 && <p>No outstanding balances.</p>}
                </div>
              </div>

              <div className="table-card">
                <h3>Layaway Collection</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Receipt</th><th>Product</th><th>Balance</th><th>Collection status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {sales.filter(s => s.saleType === "Layaway").map(s => (
                        <tr key={s.id}>
                          <td>{s.customerName}</td><td>{s.receiptNumber}</td>
                          <td>{s.productName} × {s.quantity}</td><td>{money(s.balance)}</td>
                          <td>{s.fulfillmentStatus}</td>
                          <td>
                            {s.fulfillmentStatus === "Ready for collection"
                              ? <button className="primary-button" onClick={() => markCollected(s)}><CheckCircle size={16} /> Mark Collected</button>
                              : s.fulfillmentStatus === "Collected"
                                ? "Already collected"
                                : "Awaiting full payment"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="table-card">
                <h3>Payment History</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Customer</th><th>Receipt</th><th>Payment type</th><th>Method</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{new Date(p.createdAt).toLocaleString()}</td>
                          <td>{p.customerName || "Customer"}</td>
                          <td>{p.receiptNumber}</td>
                          <td>{p.paymentType}</td>
                          <td>{p.paymentMethod}</td>
                          <td className="profit">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* EXPENSES */}
          {activePage === "Expenses" && (
            <>
              <h2>Business Expenses</h2>

              <div className="cards">
                <div className="card"><p>Total Expenses</p><h2 className="debt">{money(totalExpenses)}</h2></div>
                <div className="card"><p>Recorded Expenses</p><h2>{expenses.length}</h2></div>
                <div className="card"><p>Profit After Expenses</p><h2 className={netProfit >= 0 ? "profit" : "debt"}>{money(netProfit)}</h2></div>
              </div>

              <form className="product-form" onSubmit={recordExpense}>
                <h3>Record New Expense</h3>

                <div className="form-grid">
                  <label>Expense category *
                    <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                      <option>Rent</option><option>Salaries</option><option>Transport</option>
                      <option>Electricity</option><option>Water</option><option>Internet</option>
                      <option>Repairs and Maintenance</option><option>Marketing</option>
                      <option>Office Supplies</option><option>Other</option>
                    </select>
                  </label>

                  <label>Description *
                    <input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} required />
                  </label>

                  <label>Amount (UGX) *
                    <input type="number" min="1" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
                  </label>

                  <label>Payment method
                    <select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value, financialAccountId: "" })}>
                      <option>Cash</option><option>Bank</option><option>Mobile Money</option><option>Other</option>
                    </select>
                  </label>

                  <label>Paid from account *
                    <select
                      value={expenseForm.financialAccountId}
                      onChange={e => setExpenseForm({ ...expenseForm, financialAccountId: e.target.value })}
                      required
                    >
                      <option value="">Choose account</option>
                      {financialAccounts
                        .filter(account => account.type === expenseForm.paymentMethod)
                        .map(account => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>Expense date *
                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} required />
                  </label>
                </div>

                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={() => setExpenseForm(emptyExpense)}>Clear Form</button>
                  <button className="primary-button"><Plus size={18} /> Save Expense</button>
                </div>
              </form>

              <div className="table-card">
                <div className="table-heading">
                  <h3>Expense History</h3>
                  <button className="refresh-button" onClick={loadData}><RefreshCw size={16} /> Refresh</button>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Category</th><th>Description</th><th>Payment method</th><th>Amount</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {expenses.map(e => (
                        <tr key={e.id}>
                          <td>{e.expenseDate || e.createdAt}</td>
                          <td>{e.category}</td><td>{e.description}</td>
                          <td>{e.paymentMethod}</td>
                          <td className="debt">{money(e.amount)}</td>
                          <td><button className="delete-button" onClick={() => deleteExpense(e.id)}><Trash2 size={17} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {expenses.length === 0 && <p>No expenses recorded yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* BANKING */}
          {activePage === "Banking" && (
            <>
              <h2>Bank Account Management</h2>
              <p className="muted">Monitor deposits and withdrawals.</p>

              <div className="cards">
                <div className="card"><p>Total Bank Balance</p><h2 className={totalBankBalance >= 0 ? "profit" : "debt"}>{money(totalBankBalance)}</h2></div>
                <div className="card"><p>Total Deposits</p><h2 className="profit">{money(totalDeposits)}</h2></div>
                <div className="card"><p>Total Withdrawals</p><h2 className="debt">{money(totalWithdrawals)}</h2></div>
                <div className="card"><p>Bank Transactions</p><h2>{bankTransactions.length}</h2></div>
              </div>

              <form className="product-form" onSubmit={recordBankTransaction}>
                <h3>Record Bank Transaction</h3>

                <div className="form-grid">
                  <label>Transaction type *
                    <select value={bankForm.transactionType} onChange={e => setBankForm({ ...bankForm, transactionType: e.target.value })}>
                      <option value="Deposit">Deposit</option>
                      <option value="Withdrawal">Withdrawal</option>
                    </select>
                  </label>

                  <label>Bank account name *
                    <input value={bankForm.accountName} onChange={e => setBankForm({ ...bankForm, accountName: e.target.value })} required />
                  </label>

                  <label>Amount (UGX) *
                    <input type="number" min="1" value={bankForm.amount} onChange={e => setBankForm({ ...bankForm, amount: e.target.value })} required />
                  </label>

                  <label>Transaction date *
                    <input type="date" value={bankForm.transactionDate} onChange={e => setBankForm({ ...bankForm, transactionDate: e.target.value })} required />
                  </label>

                  <label>Description
                    <input value={bankForm.description} onChange={e => setBankForm({ ...bankForm, description: e.target.value })} />
                  </label>
                </div>

                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={() => setBankForm(emptyBank)}>Clear Form</button>
                  <button className="primary-button"><Plus size={18} /> Save {bankForm.transactionType}</button>
                </div>
              </form>

              <div className="table-card">
                <h3>Bank Account Balances</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Account</th><th>Deposits</th><th>Withdrawals</th><th>Balance</th></tr>
                    </thead>
                    <tbody>
                      {bankAccountBalances.map(a => (
                        <tr key={a.accountName}>
                          <td>{a.accountName}</td><td>{money(a.deposits)}</td>
                          <td>{money(a.withdrawals)}</td>
                          <td className={a.balance >= 0 ? "profit" : "debt"}>{money(a.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bankAccountBalances.length === 0 && <p>No bank accounts recorded yet.</p>}
                </div>
              </div>

              <div className="table-card">
                <div className="table-heading">
                  <h3>Bank Transaction History</h3>
                  <button className="refresh-button" onClick={loadData}><RefreshCw size={16} /> Refresh</button>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Type</th><th>Account</th><th>Description</th><th>Amount</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {bankTransactions.map(t => (
                        <tr key={t.id}>
                          <td>{t.transactionDate}</td><td>{t.transactionType}</td>
                          <td>{t.accountName}</td><td>{t.description || "—"}</td>
                          <td>{money(t.amount)}</td>
                          <td><button className="delete-button" onClick={() => deleteBankTransaction(t.id)}><Trash2 size={17} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bankTransactions.length === 0 && <p>No bank transactions yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* TRASH */}
          {activePage === "Trash" && (
            <>
              <div className="page-heading">
                <div>
                  <h2>Product Trash</h2>
                  <p className="muted">
                    Deleted products are kept here until restored.
                  </p>
                </div>
                <button className="refresh-button" onClick={loadData}>
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              <div className="table-card">
                <div className="table-heading">
                  <h3>Deleted Products ({trashedProducts.length})</h3>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Product Code</th>
                        <th>Buying Price</th>
                        <th>Quantity</th>
                        <th>Date Deleted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashedProducts.map(product => (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.name}</strong>
                            <small>{product.category || "Uncategorized"}</small>
                          </td>
                          <td>{product.sku || "—"}</td>
                          <td>{money(product.buyingPrice)}</td>
                          <td>{product.quantity}</td>
                          <td>
                            {product.deletedAt
                              ? new Date(product.deletedAt).toLocaleString()
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="secondary-button"
                              onClick={() => restoreProduct(product.id)}
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {trashedProducts.length === 0 && (
                    <p>Your Trash is empty. Deleted products will appear here.</p>
                  )}
                </div>
              </div>
            </>
          )}
          {/* STOCK IN */}
          {activePage === "Stock In" && (
            <>
              <h2>Stock In</h2>
              <p className="muted">Record products received from suppliers. Every purchase creates its own FIFO batch and updates inventory.</p>
              <div className="cards">
                <div className="card"><p>Stock purchases</p><h2>{stockPurchases.length}</h2></div>
                <div className="card"><p>Total purchase value</p><h2>{money(totalStockPurchases)}</h2></div>
                <div className="card"><p>Units received (all records)</p><h2>{stockPurchases.reduce((sum, p) => sum + Number(p.quantity || 0), 0)}</h2></div>
              </div>
              <form className="product-form" onSubmit={recordStockPurchase}>
                <h3>Record Supplier Delivery</h3>
                <p className="muted">Add all products received from this supplier in one purchase.</p>

                <div className="form-grid">
                  <label>Supplier name *
                    <input value={purchaseForm.supplierName} onChange={e => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value })} required />
                  </label>
                  <label>Purchase date *
                    <input type="date" value={purchaseForm.purchaseDate} onChange={e => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} required />
                  </label>
                  <label>Deliver stock to shop *
                    <input
                      list="smartbiz-shop-locations"
                      value={purchaseForm.location || "Main Shop"}
                      onChange={e => setPurchaseForm({ ...purchaseForm, location: e.target.value })}
                      placeholder="e.g. Main Shop"
                      required
                    />
                    <datalist id="smartbiz-shop-locations">
                      {shopLocations.map(location => <option key={location} value={location} />)}
                    </datalist>
                  </label>
                  <label>Payment method
                    <select value={purchaseForm.paymentMethod} onChange={e => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value, financialAccountId: "" })}>
                      <option>Cash</option><option>Bank</option><option>Mobile Money</option><option>Credit</option><option>Other</option>
                    </select>
                  </label>
                  {purchaseForm.paymentMethod !== "Credit" && purchaseForm.paymentMethod !== "Cash" && (
                    <label>Paid from account *
                      <select value={purchaseForm.financialAccountId} onChange={e => setPurchaseForm({ ...purchaseForm, financialAccountId: e.target.value })} required>
                        <option value="">Choose account</option>
                        {financialAccounts.filter(account => account.type === purchaseForm.paymentMethod).map(account => (
                          <option key={account.id} value={account.id}>{account.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="table-card" style={{ marginTop: "18px" }}>
                  <div className="table-heading">
                    <div><h3>Products in this delivery</h3><p className="muted">Type a new product name or choose an existing product. Enter its quantity, buying price and selling price.</p></div>
                    <button type="button" className="secondary-button" onClick={addPurchaseItem}><Plus size={16} /> Add Item</button>
                  </div>
                  {purchaseItems.map((item, index) => {
                    const selected = products.find(
                      p => p.name.trim().toLowerCase() === String(item.productName || "").trim().toLowerCase()
                    );
                    const lineTotal = Number(item.quantity || 0) * Number(item.buyingPrice || 0);
                    return (
                      <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px", marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                          <strong>Item {index + 1}</strong>
                          {purchaseItems.length > 1 && <button type="button" className="delete-button" onClick={() => removePurchaseItem(index)} aria-label="Remove item"><Trash2 size={16} /></button>}
                        </div>
                        <div className="form-grid">
                          <label>Product name *
                            <input
                              list="stock-in-product-suggestions"
                              value={item.productName}
                              onChange={e => updatePurchaseItem(index, "productName", e.target.value)}
                              placeholder="Type a product name or choose a suggestion"
                              required
                            />
                            {index === 0 && (
                              <datalist id="stock-in-product-suggestions">
                                {products.map(p => (
                                  <option key={p.id} value={p.name}>
                                    Current stock: {p.quantity}
                                  </option>
                                ))}
                              </datalist>
                            )}
                          </label>
                    <label>Quantity *
                            <input type="number" min="1" step="1" value={item.quantity} onChange={e => updatePurchaseItem(index, "quantity", e.target.value)} required />
                          </label>
                          <label>Buying price per item (UGX) *
                            <input type="number" min="1" step="1" value={item.buyingPrice} onChange={e => updatePurchaseItem(index, "buyingPrice", e.target.value)} required />
                          </label>
                          <label>Selling price per item (UGX) *
                            <input type="number" min="1" step="1" value={item.sellingPrice} onChange={e => updatePurchaseItem(index, "sellingPrice", e.target.value)} required />
                          </label>
                          <label>Item subtotal
                            <input value={money(lineTotal)} readOnly />
                          </label>
                        </div>
                        {selected && <p className="muted">Stock now: {selected.quantity} | Stock after delivery: {Number(selected.quantity || 0) + Number(item.quantity || 0)}</p>}
                      </div>
                    );
                  })}
                </div>

                <div className="sale-summary">
                  <div><span>Different products</span><strong>{purchaseItems.filter(item => item.productName.trim()).length}</strong></div>
                  <div><span>Total units received</span><strong>{purchaseItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong></div>
                  <div><span>Total supplier purchase</span><strong>{money(purchaseTotal)}</strong></div>
                </div>

                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={() => { setPurchaseForm(emptyPurchase); setPurchaseItems([{ productId: "", productName: "", quantity: "", buyingPrice: "", sellingPrice: "" }]); }}>Clear Form</button>
                  <button className="primary-button"><Plus size={18} /> Save All Items</button>
                </div>
              </form>
              <div className="table-card">
                <h3>Stock In History</h3>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th>Quantity</th><th>Unit cost</th><th>Total</th><th>Payment method</th><th>Action</th></tr></thead>
                    <tbody>
                      {stockPurchases.map(p => (
                        <tr key={p.id}>
                          <td>{p.purchaseDate}</td><td>{p.productName}</td><td>{p.supplierName}</td><td>{p.quantity}</td><td>{money(p.buyingPrice)}</td><td>{money(p.total)}</td><td>{p.paymentMethod}</td>
                          <td><button className="delete-button" onClick={() => deleteStockPurchase(p.id)}><Trash2 size={17} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stockPurchases.length === 0 && <p>No stock-in records yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* STOCK SOLD */}
          {activePage === "Stock Sold" && (
            <>
              <h2>Stock Sold</h2>
              <p className="muted">A separate record of every completed sale and the stock quantity sold.</p>
              <div className="cards">
                <div className="card"><p>Transactions</p><h2>{sales.length}</h2></div>
                <div className="card"><p>Units sold</p><h2>{sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0)}</h2></div>
                <div className="card"><p>Sales value</p><h2>{money(totalSales)}</h2></div>
                <div className="card"><p>Gross profit</p><h2 className="profit">{money(totalProfit)}</h2></div>
              </div>
              <div className="table-card">
                <h3>Stock Sold History</h3>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Product</th><th>Shop</th><th>Quantity</th><th>Unit price</th><th>Total</th><th>Cost</th><th>Profit</th><th>Paid</th></tr></thead>
                    <tbody>
                      {sales.map(sale => (
                        <tr key={sale.id}>
                          <td>{String(sale.createdAt || "").slice(0, 10)}</td><td>{sale.receiptNumber}</td><td>{sale.customerName}</td><td>{sale.productName}</td><td>{sale.location || "Main Shop"}</td><td>{sale.quantity}</td><td>{money(sale.sellingPrice)}</td><td>{money(sale.total)}</td><td>{money(sale.costOfGoods)}</td><td className="profit">{money(sale.grossProfit)}</td><td>{money(sale.amountPaid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sales.length === 0 && <p>No stock sold yet.</p>}
                </div>
              </div>
            </>
          )}

          {/* INVENTORY */}
          {activePage === "Inventory" && (
            <>
              <h2>Inventory Overview</h2>
              <p className="muted">See the stock held at each shop. Transfers reduce the sending shop and increase the receiving shop automatically.</p>





              <div className="cards">
                <div className="card">
                  <p>Total Stock Across All Shops</p>
                  <h2>{totalUnits}</h2>
                  <small>Combined business inventory</small>
                </div>
                <div className="card">
                  <p>Products In Stock</p>
                  <h2 style={{ color: "#16a34a" }}>{inStockProducts.length}</h2>
                  <small>More than 5 units remaining</small>
                </div>
                <div className="card">
                  <p>Low Stock</p>
                  <h2 style={{ color: "#d97706" }}>{lowStockProducts.length}</h2>
                  <small>Only 1–5 units remaining</small>
                </div>
                <div className="card">
                  <p>Out of Stock</p>
                  <h2 style={{ color: "#dc2626" }}>{outOfStockProducts.length}</h2>
                  <small>Products with zero remaining</small>
                </div>
              </div>

              <div className="table-card">
                <div className="table-heading">
                  <div>
                    <h3>Stock by Shop</h3>
                    <p className="muted">
                      Each shop has its own quantity. The total is the combined stock across all locations.
                    </p>
                  </div>
                  <button className="refresh-button" onClick={loadData}>
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>

                <div style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  margin: "16px 0"
                }}>
                  <input
                    type="search"
                    placeholder="Search product, category or code..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    style={{
                      flex: "1 1 240px",
                      minWidth: 0,
                      padding: "12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "8px"
                    }}
                  />

                  <select
                    value={stockFilter}
                    onChange={e => setStockFilter(e.target.value)}
                    style={{
                      flex: "0 1 190px",
                      padding: "12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "8px"
                    }}
                  >
                    <option value="All">All stock</option>
                    <option value="In Stock">In stock</option>
                    <option value="Low Stock">Low stock</option>
                    <option value="Out of Stock">Out of stock</option>
                  </select>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Total Stock</th>
                        {shopLocations.map(location => <th key={location}>{location}</th>)}
                        <th>Stock Status</th>
                        <th>Actual FIFO Stock Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockProducts.map(p => {
                        const quantity = Number(p.quantity || 0);
                        const status = quantity <= 0
                          ? "Out of Stock"
                          : quantity <= 5
                            ? "Low Stock"
                            : "In Stock";

                        const statusStyle = status === "Out of Stock"
                          ? { background: "#fee2e2", color: "#b91c1c" }
                          : status === "Low Stock"
                            ? { background: "#fef3c7", color: "#92400e" }
                            : { background: "#dcfce7", color: "#166534" };

                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small>{p.sku || "No product code"}</small>
                            </td>
                            <td>{p.category || "Uncategorized"}</td>
                            <td>
                              <strong style={{
                                fontSize: "16px",
                                color: quantity <= 0 ? "#dc2626" : "inherit"
                              }}>
                                {quantity}
                              </strong>
                            </td>
                            {shopLocations.map(location => {
                              const shopQuantity = getShopStock(p.id, location);
                              return (
                                <td key={location}>
                                  <strong style={{ color: shopQuantity <= 0 ? "#9ca3af" : "inherit" }}>
                                    {shopQuantity}
                                  </strong>
                                </td>
                              );
                            })}
                            <td>
                              <span style={{
                                ...statusStyle,
                                display: "inline-block",
                                padding: "5px 10px",
                                borderRadius: "20px",
                                fontSize: "11px",
                                fontWeight: 700,
                                whiteSpace: "nowrap"
                              }}>
                                {status}
                              </span>
                            </td>
                            <td>{money(getProductStockValue(p.id))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredStockProducts.length === 0 && (
                    <p style={{ padding: "20px", textAlign: "center" }}>
                      No products match your search or stock filter.
                    </p>
                  )}
                </div>
              </div>
              <div className="table-card">
                <h3>FIFO Stock Batches</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Purchase date</th><th>Product</th><th>Supplier</th>
                        <th>Shop</th><th>Original quantity</th><th>Remaining quantity</th>
                        <th>Unit cost</th><th>Remaining value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockBatches
                        .slice()
                        .sort((a, b) =>
                          String(a.purchaseDate).localeCompare(String(b.purchaseDate)) ||
                          a.id - b.id
                        )
                        .map(b => (
                          <tr key={b.id}>
                            <td>{b.purchaseDate}</td>
                            <td>{products.find(p => p.id === b.productId)?.name || "Product"}</td>
                            <td>{b.supplierName}</td>
                            <td>{b.location || "Main Shop"}</td>
                            <td>{b.quantityReceived}</td>
                            <td>{b.quantityRemaining}</td>
                            <td>{money(b.unitCost)}</td>
                            <td>{money(Number(b.quantityRemaining || 0) * Number(b.unitCost || 0))}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {stockBatches.length === 0 && <p>No stock batches found.</p>}
                </div>
              </div>


            
              <div className="table-card" style={{ marginTop: "24px" }}>
                <h3>Stock Movement History</h3>
                <p className="muted">This shows exactly why stock is reducing. Look at the "Type" column.</p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Type</th>
                        <th>Quantity Change</th>
                        <th>Shop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...stockPurchases.map(p => ({
                          date: p.purchaseDate || p.createdAt,
                          product: p.productName,
                          type: "Stock In (Purchase)",
                          qty: "+" + p.quantity,
                          shop: p.location || "Main Shop"
                        })),
                        ...sales.map(s => ({
                          date: s.createdAt,
                          product: s.productName,
                          type: "Sale (Sold)",
                          qty: "-" + s.quantity,
                          shop: s.location || "Main Shop"
                        })),
                        ...stockTransfers.map(t => ({
                          date: t.transferDate,
                          product: t.productName,
                          type: "Transfer Out",
                          qty: "-" + t.quantity,
                          shop: t.fromLocation
                        })),
                        ...stockTransfers.map(t => ({
                          date: t.transferDate,
                          product: t.productName,
                          type: "Transfer In",
                          qty: "+" + t.quantity,
                          shop: t.toLocation
                        }))
                      ]
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 50)
                      .map((log, index) => (
                        <tr key={index}>
                          <td>{new Date(log.date).toLocaleDateString()}</td>
                          <td>{log.product}</td>
                          <td style={{ color: log.qty.startsWith("-") ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>
                            {log.type}
                          </td>
                          <td style={{ color: log.qty.startsWith("-") ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>
                            {log.qty}
                          </td>
                          <td>{log.shop}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
</>
          )}

          {/* MOVE STOCK */}
          {activePage === "Move Stock" && (
            <>
              <div className="page-heading">
                <div>
                  <h2>Stock Transfers</h2>
                  <p className="muted">
                    Move goods between your business locations. Stock decreases at the sending shop and increases at the receiving shop automatically.
                  </p>
                </div>
              </div>

              <div className="form-card">
                <h3>Record a Stock Transfer</h3>
                <p className="muted">Choose the product, sending shop, receiving shop and quantity. The system updates both shop balances and keeps a transfer record.</p>

                <form onSubmit={recordStockTransfer}>
                  <div className="form-grid">
                    <label>
                      Select Product
                      <select
                        required
                        value={transferForm.productId}
                        onChange={e => setTransferForm({
                          ...transferForm,
                          productId: e.target.value
                        })}
                      >
                        <option value="">Choose a product</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Sending shop
                      <input
                        list="transfer-shop-locations"
                        value={transferForm.fromLocation}
                        onChange={e => setTransferForm({ ...transferForm, fromLocation: e.target.value })}
                        placeholder="e.g. Main Shop"
                        required
                      />
                    </label>

                    <label>
                      Receiving shop
                      <input
                        list="transfer-shop-locations"
                        value={transferForm.toLocation}
                        onChange={e => setTransferForm({ ...transferForm, toLocation: e.target.value })}
                        placeholder="e.g. Second Shop"
                        required
                      />
                    </label>

                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={transferForm.quantity}
                        onChange={e => setTransferForm({
                          ...transferForm,
                          quantity: e.target.value
                        })}
                        placeholder="Enter quantity"
                      />
                    </label>

                    <label>
                      Available at sending shop
                      <input
                        value={transferForm.productId
                          ? getShopStock(Number(transferForm.productId), transferForm.fromLocation || "Main Shop")
                          : "Select a product"}
                        readOnly
                      />
                    </label>

                    <label>
                      Transfer Date
                      <input
                        type="date"
                        required
                        value={transferForm.transferDate}
                        onChange={e => setTransferForm({
                          ...transferForm,
                          transferDate: e.target.value
                        })}
                      />
                    </label>
                  </div>
                  <datalist id="transfer-shop-locations">
                    {shopLocations.map(location => <option key={location} value={location} />)}
                  </datalist>

                  <button type="submit" className="primary-button">
                    <ArrowLeftRight size={17} />
                    Transfer Stock
                  </button>
                </form>
              </div>

              <div className="table-card">
                <h3>Stock Transfer History</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Sending shop</th>
                        <th>Receiving shop</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockTransfers.map(transfer => (
                        <tr key={transfer.id}>
                          <td>{transfer.transferDate}</td>
                          <td>{transfer.productName}</td>
                          <td>{transfer.fromLocation}</td>
                          <td>{transfer.toLocation}</td>
                          <td>{transfer.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {stockTransfers.length === 0 && (
                    <p>No stock transfers recorded yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
          {/* RECEIPTS */}
          {activePage === "Receipts" && (
            <>
              <div className="page-heading no-print">
                <div>
                  <h2>Customer Receipts</h2>
                  <p className="muted">View and print previous sales receipts.</p>
                </div>

                <select className="receipt-select" value={receiptWidth} onChange={e => setReceiptWidth(e.target.value)}>
                  <option value="thermal-58">58mm Thermal</option>
                  <option value="thermal-80">80mm Thermal</option>
                  <option value="a4">A4 Paper</option>
                </select>
              </div>

              <div className="table-card no-print">
                <h3>Sales Receipts</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Receipt</th><th>Customer</th><th>Shop</th><th>Type</th><th>Total</th><th>Paid</th><th>Balance</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {sales.map(s => (
                        <tr key={s.id}>
                          <td>{s.receiptNumber}</td><td>{s.customerName}</td>
                          <td>{s.location || "Main Shop"}</td><td>{s.saleType}</td><td>{money(s.total)}</td>
                          <td>{money(s.amountPaid)}</td><td>{money(s.balance)}</td>
                          <td>
                            <button className="primary-button" onClick={() => setSelectedReceipt(s)}>
                              <Eye size={16} /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedReceipt && (
                <div className="receipt-paper-container">
                  <div className={`receipt-paper ${receiptWidth}`}>
                    <div className="receipt-business">
                      <h2>SMARTBIZ BUSINESS</h2>
                      <p>CUSTOMER SALES RECEIPT</p>
                      <p>Uganda</p>
                    </div>

                    <hr />
                    <p><strong>Receipt:</strong> {selectedReceipt.receiptNumber}</p>
                    <p><strong>Date:</strong> {new Date(selectedReceipt.createdAt).toLocaleString()}</p>
                    <p><strong>Customer:</strong> {selectedReceipt.customerName}</p>
                    <p><strong>Shop:</strong> {selectedReceipt.location || "Main Shop"}</p>
                    <p><strong>Phone:</strong> {selectedReceipt.customerPhone || "Not provided"}</p>
                    <p><strong>Transaction:</strong> {selectedReceipt.saleType}</p>
                    <hr />

                    <table>
                      <thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead>
                      <tbody>
                        <tr>
                          <td>{selectedReceipt.productName}</td>
                          <td>{selectedReceipt.quantity}</td>
                          <td>{money(selectedReceipt.sellingPrice)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <hr />

                    <div className="receipt-total">
                      <p>Total: <strong>{money(selectedReceipt.total)}</strong></p>
                      <p>Paid: <strong>{money(selectedReceipt.amountPaid)}</strong></p>
                      <p>Balance: <strong>{money(selectedReceipt.balance)}</strong></p>
                      <p>Payment method: <strong>{selectedReceipt.paymentMethod}</strong></p>
                      <p>Collection: <strong>{selectedReceipt.fulfillmentStatus}</strong></p>
                      <h3>{(selectedReceipt.paymentStatus || "Paid").toUpperCase()}</h3>
                    </div>

                    {selectedReceiptPayments.length > 0 && (
                      <>
                        <hr />
                        <h4>Payment history</h4>
                        {selectedReceiptPayments.map(p => (
                          <p key={p.id}>
                            {new Date(p.createdAt).toLocaleDateString()} — {p.paymentType} — {money(p.amount)}
                          </p>
                        ))}
                      </>
                    )}

                    <hr />
                    <p className="receipt-footer">Thank you for shopping with us!</p>
                  </div>

                  <div className="form-actions no-print">
                    <button className="secondary-button" onClick={() => setSelectedReceipt(null)}>
                      <X size={17} /> Close
                    </button>
                    <button className="primary-button" onClick={printReceipt}>
                      <Printer size={18} /> Print Receipt
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {activePage === "Reports" && (
            <div className="welcome-card report-print-area">
              <h2>Business Reports</h2>
              <p>Review sales, money received, profit, expenses and stock movement by day, month or year.</p>
              <button
                type="button"
                className="report-print-button"
                onClick={() => window.print()}
                style={{ padding: "11px 18px", margin: "12px 0", cursor: "pointer" }}
              >
                <Printer size={18} /> Print Business Report
              </button>

              <div style={{ margin: "20px 0" }}>
                <label>Report period: </label>
                <select
                  value={reportPeriod}
                  onChange={e => setReportPeriod(e.target.value)}
                  style={{ padding: "10px", borderRadius: "8px" }}
                >
                  <option value="today">Today</option>
                  <option value="week">Last 7 days</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="all">All time</option>
                </select>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "14px",
                marginBottom: "25px"
              }}>
                {[
                  ["Sales value", reportSalesTotal],
                  ["Money received", reportReceived],
                  ["FIFO gross profit", reportGrossProfit],
                  ["Business expenses", reportExpenseTotal],
                  ["Net profit", reportNetProfit],
                  ["Stock purchases value", reportPurchaseTotal],
                  ["Stock in units", reportStockInUnits],
                  ["Stock sold units", reportStockSoldUnits],
                  ["Outstanding debts", reportOutstanding]
                ].map(([label, value]) => (
                  <div key={label} style={{
                    background: "var(--card-bg, #ffffff)",
                    border: "1px solid var(--border-color, #e5e7eb)",
                    borderRadius: "12px",
                    padding: "18px"
                  }}>
                    <p style={{ margin: "0 0 8px", opacity: 0.7 }}>{label}</p>
                    <h3 style={{ margin: 0 }}>{money(value)}</h3>
                  </div>
                ))}
              </div>

              <h3>Customer payments by method</h3>
              {reportPaymentMethods.length === 0 ? (
                <p>No customer payments recorded in this period.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr><th>Payment method</th><th>Amount received</th></tr>
                    </thead>
                    <tbody>
                      {reportPaymentMethods.map(item => (
                        <tr key={item.method}>
                          <td>{item.method}</td>
                          <td>{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: "28px" }}>Best-selling products</h3>
              {reportBestSellers.length === 0 ? (
                <p>No sales recorded in this period.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Units sold</th>
                        <th>Sales value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportBestSellers.map(item => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.quantity}</td>
                          <td>{money(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: "28px" }}>Profit summary</h3>
              <p>Gross profit: <strong>{money(reportGrossProfit)}</strong></p>
              <p>Less business expenses: <strong>{money(reportExpenseTotal)}</strong></p>
              <p>Net profit: <strong>{money(reportNetProfit)}</strong></p>

              <p style={{ opacity: 0.7, fontSize: "13px" }}>
                Stock purchases are shown separately and are not subtracted again
                from net profit because FIFO cost is already included in gross profit.
                Outstanding debts show the current balance across all sales.
              </p>
            </div>
          )}

          {activePage === "Financial Management" && (
            <>
              <h2>Financial Management</h2>
              <p className="muted">
                Manage your cash, bank accounts and mobile money balances.
              </p>

              <div className="cards">
                <div className="card">
                  <p>Total Available Business Money</p>
                  <h2 className="profit">
                    {money(financialAccounts.reduce((total, account) => {
                      const balance = financialTransactions
                        .filter(t => t.accountId === account.id)
                        .reduce((sum, t) => {
                          const amount = Number(t.amount || 0);
                          if (["Opening Balance", "Deposit", "Income", "Transfer In"].includes(t.transactionType)) {
                            return sum + amount;
                          }
                          if (["Withdrawal", "Expense", "Stock Purchase", "Transfer Out"].includes(t.transactionType)) {
                            return sum - amount;
                          }
                          return sum;
                        }, 0);
                      return total + balance;
                    }, 0))}
                  </h2>
                </div>

                <div className="card">
                  <p>Financial Accounts</p>
                  <h2>{financialAccounts.length}</h2>
                </div>

                <div className="card">
                  <p>Recorded Financial Transactions</p>
                  <h2>{financialTransactions.length}</h2>
                </div>
              </div>

              <form className="product-form" onSubmit={addFinancialAccount}>
                <h3>Create Financial Account</h3>

                <div className="form-grid">
                  <label>Account name *
                    <input
                      value={accountForm.name}
                      onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                      required
                    />
                  </label>

                  <label>Account type *
                    <select
                      value={accountForm.type}
                      onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}
                    >
                      <option>Cash</option>
                      <option>Bank</option>
                      <option>Mobile Money</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label>Provider (e.g. Stanbic, MTN)
                    <input
                      value={accountForm.provider}
                      onChange={e => setAccountForm({ ...accountForm, provider: e.target.value })}
                    />
                  </label>

                  <label>Opening Balance (UGX)
                    <input
                      type="number"
                      min="0"
                      value={accountForm.openingBalance}
                      onChange={e => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button className="primary-button"><Plus size={18} /> Create Account</button>
                </div>
              </form>

              <div className="table-card">
                <h3>Financial Accounts and Balances</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Account Name</th><th>Type</th><th>Provider</th><th>Balance</th></tr>
                    </thead>
                    <tbody>
                      {financialAccounts.map(account => {
                        const balance = financialTransactions
                          .filter(t => t.accountId === account.id)
                          .reduce((sum, t) => {
                            const amount = Number(t.amount || 0);
                            if (["Opening Balance", "Deposit", "Income", "Transfer In"].includes(t.transactionType)) {
                              return sum + amount;
                            }
                            if (["Withdrawal", "Expense", "Stock Purchase", "Transfer Out"].includes(t.transactionType)) {
                              return sum - amount;
                            }
                            return sum;
                          }, 0);

                        return (
                          <tr key={account.id}>
                            <td>{account.name}</td>
                            <td>{account.type}</td>
                            <td>{account.provider || "—"}</td>
                            <td className={balance >= 0 ? "profit" : "debt"}>{money(balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {financialAccounts.length === 0 && <p>No financial accounts created yet.</p>}
                </div>
              </div>

              <div className="table-card">
                <h3>Financial Transaction History</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Account</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {financialTransactions.map(t => {
                        const account = financialAccounts.find(a => a.id === t.accountId);
                        const isIncome = ["Opening Balance", "Deposit", "Income", "Transfer In"].includes(t.transactionType);
                        return (
                          <tr key={t.id}>
                            <td>{t.transactionDate}</td>
                            <td>{account?.name || "Unknown"}</td>
                            <td>{t.transactionType}</td>
                            <td>{t.category}</td>
                            <td>{t.description}</td>
                            <td className={isIncome ? "profit" : "debt"}>
                              {isIncome ? "+" : "-"}{money(t.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {financialTransactions.length === 0 && <p>No financial transactions recorded yet.</p>}
                </div>
              </div>
            </>
          )}

          {activePage === "Settings" && (
            <div className="welcome-card">
              <h2>Settings</h2>
              <p>Application settings and configurations.</p>
            </div>
          )}

        </section>
      {/* DELETE CONFIRMATION MODAL */}
      {pendingDeleteId !== null && (
        <div className="modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: "#fff", padding: "24px", borderRadius: "12px",
            width: "100%", maxWidth: "400px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{ marginTop: 0 }}>Confirm Deletion</h3>
            <p style={{ fontSize: "14px", color: "#555", marginBottom: "20px" }}>
              To move this product to Trash, please verify your owner account.
            </p>
            
            <form onSubmit={confirmDeleteProduct}>
              <label style={{ display: "block", marginBottom: "12px", fontSize: "14px", fontWeight: "bold" }}>
                Owner Email
                <input 
                  type="email" 
                  value={deleteEmail} 
                  onChange={e => setDeleteEmail(e.target.value)} 
                  required 
                  style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "20px", fontSize: "14px", fontWeight: "bold" }}>
                Password
                <input 
                  type="password" 
                  value={deletePassword} 
                  onChange={e => setDeletePassword(e.target.value)} 
                  required 
                  style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button 
                  type="button" 
                  className="secondary-button" 
                  onClick={cancelDeleteProduct}
                  disabled={deleteBusy}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="delete-button" 
                  style={{ backgroundColor: "#dc2626", color: "white", padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer" }}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? "Verifying..." : "Delete Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}

export default App;

