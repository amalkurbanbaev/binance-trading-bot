import Binance, { Order, OrderType } from "binance-api-node";
import dotenv from "dotenv";
dotenv.config();

const client = Binance({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
});

const symbol = "SOLUSDT";
const buyQuantity = 3; // Количество для покупки
const sellQuantity = 3; // Количество для продажи
const buyPriceOffset = 0.002; // Смещение цены покупки вниз (например, 0.01 = 1%)
const sellPriceOffset = 0.002; // Смещение цены продажи вверх (например, 0.01 = 1%)

const getData = async () => {
    const time = await client.time();
    const asks = (await client.book({ symbol: symbol })).asks;
    const bids = (await client.book({ symbol: symbol })).bids;

    const aggregatedInfo = await client.aggTrades({
        symbol: symbol,
        limit: 3,
    });
    const recentTrades = await client.trades({ symbol: symbol, limit: 3 });

    const prices = await client.prices({ symbol: symbol });

    console.error(prices);
};

const getMyOrders = async () => {
    const myOrders = await client.openOrders({
        symbol: symbol,
    });
    return myOrders;
};

const strategyMaker = async () => {};

type CreateOrderOptions = {
    type: "BUY" | "SELL";
};

// Функция для получения доступного баланса
async function getAvailableBalance(asset: string): Promise<number> {
    try {
        const accountInfo = await client.accountInfo();
        const balance = accountInfo.balances.find((b) => b.asset === asset);
        if (balance) {
            return parseFloat(balance.free);
        }
    } catch (error) {
        console.error("Ошибка получения доступного баланса:", error);
    }
    return 0;
}

// создание ордера на покупку
const placeBuyOrder = async (): Promise<Order | undefined> => {
    try {
        const availableBalance = await getAvailableBalance("USDT");

        const tickerPrice = await client.prices({ symbol: symbol });
        const currentPrice = parseFloat(tickerPrice[symbol]);
        const buyPrice = (currentPrice * (1 - buyPriceOffset)).toFixed(2);

        if (availableBalance < buyQuantity * parseFloat(buyPrice)) {
            console.log("Недостаточно доступного баланса для покупки.");
            return undefined;
        }
        const buyOrder = await client.order({
            symbol: symbol,
            side: "BUY",
            quantity: String(buyQuantity),
            type: OrderType.LIMIT,
            price: buyPrice,
        });

        console.log(`Ордер на покупку размещен. Цена: ${buyPrice}`);

        return buyOrder;
    } catch (error) {
        console.error("Ошибка размещения ордера на покупку:", error);
    }
};

// создание ордера на продажу
const placeSellOrder = async (buyOrder: Order): Promise<Order | undefined> => {
    try {
        const sellPrice = (
            parseFloat(buyOrder.price) *
            (1 + sellPriceOffset)
        ).toFixed(2);

        const sellOrder = await client.order({
            symbol,
            side: "SELL",
            quantity: String(sellQuantity),
            type: OrderType.LIMIT,
            price: sellPrice,
        });

        return sellOrder;
    } catch (error) {
        console.error("Ошибка размещения ордера на продажу:", error);
    }
};

// Функция для ожидания исполнения ордера на покупку
async function waitForBuyOrderExecution(buyOrder: Order): Promise<void> {
    try {
        const orderId = buyOrder.orderId;
        let orderStatus = await client.getOrder({ symbol, orderId });
        while (orderStatus.status !== "FILLED") {
            console.log(`Ордер на покупку (${orderId}) ожидает исполнения...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            orderStatus = await client.getOrder({ symbol, orderId });
        }
        console.log(`Ордер на покупку (${orderId}) исполнен.`);
    } catch (error) {
        console.error("Ошибка ожидания исполнения ордера на покупку:", error);
    }
}

// Функция для ожидания исполнения ордера на продажу
async function waitForSellOrderExecution(): Promise<void> {
    try {
        let orders = await client.openOrders({ symbol });
        while (orders.length > 0) {
            console.log("Ордер на продажу ожидает исполнения...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const updatedOrders = await client.openOrders({ symbol });
            orders = updatedOrders;
        }
        console.log("Ордер на продажу исполнен.");
    } catch (error) {
        console.error("Ошибка ожидания исполнения ордера на продажу:", error);
    }
}
// Глобальная переменная для отслеживания состояния ордера на покупку
let isBuyOrderPlaced = false;

// Главная функция для выполнения стратегии
async function executeStrategy() {
    try {
        if (!isBuyOrderPlaced) {
            const buyOrder = await placeBuyOrder();
            if (buyOrder) {
                isBuyOrderPlaced = true;
                await waitForBuyOrderExecution(buyOrder);
                await placeSellOrder(buyOrder);
                await waitForSellOrderExecution();
                isBuyOrderPlaced = false; // Сбрасываем флаг после исполнения ордера на продажу
            }
        }
    } catch (error) {
        console.error("Ошибка выполнения стратегии:", error);
    } finally {
        executeStrategy(); // Рекурсивный вызов функции executeStrategy()
    }
}

// Запуск стратегии
executeStrategy();
