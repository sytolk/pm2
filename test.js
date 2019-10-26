'use strict'
let pm2 = require('.')

let tm = 0
function runTest(what, after, test) {
    tm += after
    setTimeout(() => {
        console.log(`\n***** ${what} *****`)
        test()
    }, tm)
}

runTest("These should fail for various reasons",
    100,
    () => {
        pm2.start()
        pm2.start({
            name: 'fails',
        }, (err) => {
            console.error('fails:',err)
        })
        pm2.start({
            name: 'fail1',
            cwd: './tester',
        })
        pm2.start({
            name: 'fail2',
            script: './tester',
        })
    })

runTest("Start a NodeJS process",
    1000,
    () => {
        pm2.start({
            name: 'nodejs-process',
            cwd: './tester/with-new/process1'
        })
    })

runTest("Start a Python process (output in log file)",
    1000,
    () => {
        pm2.start({
            name: 'python-process',
            script: './tester/with-new/process1/process2/serve.py',
            log: 'process2.log',
        }, (err, pid) => {
            if(err) console.error(err)
            if(pid) console.log(`PID: ${pid}`)
        })
    })

runTest("Stop the Python process",
    2000,
    () => pm2.stop('python-process'))

runTest("Restart the NodeJS process",
    1000, () => pm2.restart('nodejs-process'))

runTest("Stop the Python process again (will fail)",
    1000,
    () => {
        pm2.stop('python-process', (err) => {
            if(err) console.error(err)
        })
    })

runTest("Stop the NodeJS process completely",
    1000,
    () => {
        pm2.stop('nodejs-process', (err) => {
            if(err) console.error(err)
        })
    })
