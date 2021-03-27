require('dotenv').config();

async function run() {
    const { ClientBuilder } = require('@iota/client')
    const client = new ClientBuilder()
        .node('https://api.hornet-1.testnet.chrysalis2.com')
        .disableNodeSync()
        .localPow(true)
        .build()

    const addresses = await client.getAddresses(process.env.NONSECURE_USE_OF_DEVELOPMENT_SEED_1)
        .range(0, 1)
        .get()
    console.log('Need a refill? Send it this address:', addresses[0])

    let balance = await client.getBalance(process.env.NONSECURE_USE_OF_DEVELOPMENT_SEED_1).get();
    console.log('Balance:', balance)
    // Webserver part

    const express = require('express')
    const rateLimit = require('express-rate-limit')
    const app = express()
    const port = process.env.PORT || 3000
    const secs = parseInt(process.env.RATE_LIMIT_SECONDS || 60)
    const amount = parseInt(process.env.TOKENS_TO_SEND || 1000000)

    const limiter = rateLimit({
        windowMs: 1000 * secs,
        max: 1,
        skipFailedRequests: true,
        message: { 'message': `You can only request tokens from the faucet once every ${secs} seconds.` }
    });

    app.set('trust proxy', true);
    app.use(express.static('frontend/public'))
    app.use('/api', limiter);

    app.get('/api', async (req, res) => {

        console.log('API called by ', req.ip, req.ips);
        if (!req.query.address || req.query.address.length != 64 || req.query.address.indexOf('atoi1') !== 0 || req.query.address == addresses[0]) {
            res.status(400);
            res.send({ 'message': 'Invalid address provided!' })
            return;
        }

        try {
            const inputs = await client.findOutputs([], addresses);
            console.log("Inputs length: " + inputs.length);
            let messageBuilder = client
                .message()
                .seed(process.env.NONSECURE_USE_OF_DEVELOPMENT_SEED_1);
            let input_balance = 0
            let counter = 0;
            for (input of inputs) {
                input_balance += input.amount;
                messageBuilder = messageBuilder.input(input.transactionId, input.outputIndex)
                counter++;
                // Max inputs is 127
                if (counter > 126) {
                    break
                }
            }
            if (input_balance - amount != 0 && inputs.length > 1) {
                messageBuilder = messageBuilder.output(addresses[0], input_balance - amount)
            }
            let message = await messageBuilder.output(req.query.address, amount)
                .submit()
            console.log(message);
            res.send({ 'message': 'Faucet tokens sent!', 'data': { id: message.messageId } })
        } catch (e) {
            console.log('ERROR', e);
            res.status(503);
            res.send({ 'message': 'Please try again later: \n' + e })
            return;
        }
    });

    app.listen(port, () => {
        console.log(`Faucet server running on port ${port}`)
    });
}

run()
