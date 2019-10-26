'use strict'
const fs = require('fs')
const path = require('path')
const proc = require('child_process')

module.exports = {
    start : start,
    restart: restartByName,
    stop: stopByName,
    stopall,
    onstopping,
}

/*      understand/
 * PROCESS REGISTRY
 */
let REG = []

/*      understand/
 * Shutdown hook
 */
let ONSTOPPING

/*      outcome/
 * We get the values we require from the user, set up some defaults, and
 * start the given process depending on what type it is
 */
function start(pi, cb) {
    if(!cb) cb = (err) => { if(err) console.error(err) }

    if(!pi) return cb(`Cannot start process without any information`)
    if(!pi.script && !pi.cwd) return cb(`Cannot start process without 'script' or 'cwd'`)

    pi = {
        name: pi.name,
        script: pi.script,
        cwd: pi.cwd,
        log: pi.log,
        restartAt: pi.restartAt,
        cb: cb,
    }

    get_script_1(pi, (script) => {
        pi._script = script
        if(!pi._script) {
            cb(`No script given to run`)
            return
        }
        let handler = getScriptHandler(script)
        if(handler) {
            REG.push(pi)
            handler(pi)
            cb()
        } else {
            cb(`Don't know how to start ${script}`)
            return
        }
    })

    /*      understand/
     * A nodejs module contains a 'package.json' file which generally
     * gives the 'main' entry script for the module. So we can use this
     * to find the script to run if we haven't been given it.
     *
     *      outcome/
     * If the script is provided, we use that. Otherwise we check if we
     * are a node module and try and derive the script from the
     * 'package.json'.
     */
    function get_script_1(pi, cb) {
        if(pi.script) return cb(pi.script)
        try {
            let pkg = path.join(pi.cwd, 'package.json')
            fs.readFile(pkg, (err, data) => {
                if(err) cb()
                else {
                    let obj = JSON.parse(data)
                    cb(obj.main)
                }
            })
        } catch(e) {
            cb()
        }
    }
}

function restartByName(name) {
    REG.forEach((pi) => {
        if(pi.name === name) restart(pi)
    })
}

function stopByName(name) {
    REG.forEach((pi) => {
        if(pi.name === name) stop(pi)
    })
}

function stopall() {
    REG.forEach(stop)
}

function onstopping(hook) {
    ONSTOPPING = hook
}

function restart(pi) {
}

function stop(pi) {
}

/*      problem/
 * Depending on the type of file we need to run, return a handler that
 * can launch that type.
 *      way/
 * Use the extension of the file to determine it's type and then return
 * a matching handler
 */
function getScriptHandler(script) {
    let handlers = {
        ".js" : launchJSProcess,
        ".py" : launchPythonProcess,
    }
    let ext = path.extname(script)
    if(ext) return handlers[ext]
}

/*      outcome/
 * We use the standard `child_process.spawn` function to launch a python
 * process with the given script as the first argument. Then we capture
 * the output and handle process exits.
 */
function launchPythonProcess(pi) {
    let opts = {
        windowsHide: false,
        detached: false,
    }

    if(pi.cwd) opts.cwd = pi.cwd
    if(pi.env) opts.env = pi.env
    if(!pi.args) pi.args = [pi._script]
    else pi.args = [pi._script].concat(pi.args)

    pi.child = proc.spawn('python', pi.args, opts)

    pi.flush = captureOutput(pi)
    handleExit(pi)
}

/*      understand/
 * To launch the requested process as a new NodeJS process, we use a
 * special node js function (`child_process.fork`) that launches other
 * nodejs processes and creates a connection with them so we can
 * communicate via messages. This both (a) allows us to use the electron
 * embedded NodeJS and allows us to send messages requesting the child
 * to shutdown when we are shutting down ourselves.
 *
 *      outcome/
 * Launch the child process using `child_process.fork`, capturing the
 * output and handling what happens when the process exits.
 */
function launchJSProcess(pi) {
    let opts = {
        silent: true,
        detached: false,
    }

    if(pi.cwd) opts.cwd = pi.cwd
    if(pi.env) opts.env = pi.env
    if(!pi.args) pi.args = []

    pi.child = proc.fork(pi._script, pi.args, opts)

    pi.flush = captureOutput(pi)
    handleExit(pi)
}

/*      outcome/
 * As data comes in either the error or output stream we capture it and
 * show individual lines.
 */
function captureOutput(pi) {
    let op = ""
    let er = ""

    pi.child.stdout.on('data', (data) => {
        op += data
        op = show_lines_1(op)
    })
    pi.child.stderr.on('data', (data) => {
        er += data
        er = show_lines_1(er, true)
    })

    return flush

    function flush() {
        if(op && op.trim()) out(pi, op.trim())
        if(er && er.trim()) out(pi, er.trim(), true)
        op = ""
        er = ""
    }

    function show_lines_1(f, iserr) {
        if(!f) return f

        let lines = f.split(/[\n\r]+/)
        for(let i = 0;i < lines.length-1;i++) {
            out(pi, lines[i], iserr)
        }
        return lines[lines.length-1]
    }

    /*      outcome/
     * Given a log file we output to the log file. If no log file is
     * given we output to stdout/stderr.
     */
    function out(pi, line, iserr) {
        if(pi.log) {
            fs.appendFile(pi.log, line + '\n', (err) => {
                if(err) {
                    console.error(m)
                    console.error(err)
                }
            })
        } else {
            if(iserr) console.error(line)
            else console.log(line)
        }
    }
}

/*      understand/
 * The ChildProcess is an `EventEmitter` with the following events:
 *      + 'error': Failed to start the given process
 *      + 'exit': Process exited (fires sometimes)
 *      + 'close': Process exited cleanly
 * `exit` and `close` may both be fired or not.
 *
 *      outcome/
 * If there is an error, exit, or close, we flush whatever data we have
 * so far and then callback with the error or completion.
 */
function handleExit(pi) {
    pi.child.on('error', (err) => {
        pi.flush && pi.flush()
        pi.cb && pi.cb(err)
    })
    pi.child.on('exit', on_done_1)
    pi.child.on('close', on_done_1)

    function on_done_1(code, signal) {
        pi.flush && pi.flush()
        if(code || signal) {
            pi.cb && pi.cb(`Exited with error`)
        } else {
            pi.cb && pi.cb()
        }
    }

}
