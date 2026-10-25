const fs = require('fs');
const assert = require('assert');

// Read app.js and extract the core functions to test
const appJsCode = fs.readFileSync('public/app.js', 'utf8');

// Test CSV parser
function runTests() {
    console.log("Running CSV and SQL cruncher unit tests...");

    // We can evaluate parseCSV and formatTerminalTable and FallbackSqliteDb in sandbox
    const vm = require('vm');
    const sandbox = {
        console,
        window: {
            addEventListener: () => {}
        },
        termPrint: () => {},
        Module: {},
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {} }),
            addEventListener: () => {}
        }
    };
    vm.createContext(sandbox);

    // Run app.js inside VM to test functions
    vm.runInContext(appJsCode, sandbox);

    const parseCSV = vm.runInContext('parseCSV', sandbox);
    const formatTerminalTable = vm.runInContext('formatTerminalTable', sandbox);
    const FallbackSqliteDb = vm.runInContext('FallbackSqliteDb', sandbox);

    // 1. Test CSV Parsing
    const sampleCsv = `name,age,city,notes\nAlice,30,"New York, NY","Likes, quotes"\nBob,25,London,"Escaped ""quotes"""\nCharlie,35,Paris,\n`;
    const rows = parseCSV(sampleCsv);

    assert.strictEqual(rows.length, 4, "Should parse 4 rows (1 header + 3 data)");
    assert.strictEqual(JSON.stringify(rows[0]), JSON.stringify(['name', 'age', 'city', 'notes']));
    assert.strictEqual(rows[1][0], 'Alice');
    assert.strictEqual(rows[1][2], 'New York, NY');
    assert.strictEqual(rows[2][3], 'Escaped "quotes"');
    console.log("PASS: parseCSV passed RFC 4180 parsing test.");

    // 2. Test Terminal Table Formatter
    const headers = ['id', 'name', 'salary'];
    const data = [
        [1, 'Alice', 95000],
        [2, 'Bob', 82000]
    ];
    const lines = formatTerminalTable(headers, data);
    assert(lines.length >= 4, "Should produce header, separator, and 2 data lines");
    assert(lines[0].includes('name'), "Header line should contain column names");
    assert(lines[1].includes('-+-'), "Separator line should contain -+- separators");
    assert(lines[2].includes('Alice'), "First data row should contain Alice");
    console.log("PASS: formatTerminalTable passed alignment test.");

    // 3. Test FallbackSqliteDb
    const db = new FallbackSqliteDb();
    db.exec(`CREATE TABLE temp_table ("name" TEXT, "age" INTEGER, "city" TEXT)`);
    db.exec(`INSERT INTO temp_table VALUES ('Alice', 30, 'New York')`);
    db.exec(`INSERT INTO temp_table VALUES ('Bob', 25, 'London')`);
    db.exec(`INSERT INTO temp_table VALUES ('Charlie', 35, 'Paris')`);

    // Test SELECT *
    let selectRows = [];
    let selectCols = [];
    db.exec({
        sql: 'SELECT * FROM temp_table',
        columnNames: selectCols,
        callback: (r) => selectRows.push(r)
    });
    assert.strictEqual(selectRows.length, 3, "SELECT * should return 3 rows");
    assert.strictEqual(JSON.stringify(selectCols), JSON.stringify(['name', 'age', 'city']));

    // Test WHERE clause
    let filterRows = [];
    db.exec({
        sql: 'SELECT name, age FROM temp_table WHERE age > 26',
        callback: (r) => filterRows.push(r)
    });
    assert.strictEqual(filterRows.length, 2, "WHERE age > 26 should return 2 rows (Alice and Charlie)");

    // Test ORDER BY
    let orderRows = [];
    db.exec({
        sql: 'SELECT name, age FROM temp_table ORDER BY age DESC',
        callback: (r) => orderRows.push(r)
    });
    assert.strictEqual(orderRows[0][0], 'Charlie', "Charlie should be first ordered DESC by age");

    // Test LIMIT
    let limitRows = [];
    db.exec({
        sql: 'SELECT name FROM temp_table LIMIT 1',
        callback: (r) => limitRows.push(r)
    });
    assert.strictEqual(limitRows.length, 1, "LIMIT 1 should return exactly 1 row");

    // Test COUNT(*)
    let countRows = [];
    db.exec({
        sql: 'SELECT COUNT(*) FROM temp_table',
        callback: (r) => countRows.push(r)
    });
    assert.strictEqual(countRows[0][0], 3, "COUNT(*) should return 3");

    console.log("PASS: FallbackSqliteDb passed all query execution tests.");

    // 4. Test loadCSVIntoDatabase and executeSqlQuery integration
    const printed = [];
    sandbox.termPrint = (msg, type) => {
        printed.push({ msg, type });
    };

    const loadCSVIntoDatabase = vm.runInContext('loadCSVIntoDatabase', sandbox);
    const executeSqlQuery = vm.runInContext('executeSqlQuery', sandbox);

    loadCSVIntoDatabase(`id,name,role\n101,Alice,Engineer\n102,Bob,Designer\n`, 'team.csv').then(() => {
        assert(printed.some(p => p.msg.includes('temp_table')), "Should announce temp_table creation");
        return executeSqlQuery('SELECT * FROM temp_table WHERE id = 101');
    }).then(() => {
        assert(printed.some(p => p.msg.includes('Alice')), "Should print Alice in terminal output");
        console.log("PASS: loadCSVIntoDatabase and executeSqlQuery end-to-end integration passed.");
        console.log("All unit tests completed successfully!");
    }).catch(err => {
        console.error("Integration test error:", err);
        process.exit(1);
    });
}

runTests();
