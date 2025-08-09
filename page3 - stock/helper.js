let lastPrice = null

function isUpdated(newPrice){
    return newPrice !== lastPrice
}

function updateLastPrice(price){
    lastPrice = price
}

export { isUpdated , updateLastPrice } 