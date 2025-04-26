#!/usr/bin/env node

/**
 * 文件系统MCP服务器命令行工具
 * 提供通过命令行启动和配置MCP服务器的功能
 */

const { program } = require('commander');
const { startServer } = require('../index');
const path = require('path');
const fs = require('fs');
const os = require('os');
const packageJson = require('../package.json');

// 获取版本号
const version = packageJson.version;

// 显示Banner
function showBanner() {
  console.log('=================================================');
  console.log('          文件系统MCP服务器 CLI                  ');
  console.log('=================================================');
  console.log(`版本: ${version}`);
  console.log('框架: Model Context Protocol SDK');
  console.log('=================================================');
}

// 配置命令行参数
program
  .name('mcp-filesystem-server')
  .description('基于MCP的文件系统操作服务器')
  .version(version);

// 启动服务器命令
program
  .command('start')
  .description('启动MCP文件系统服务器')
  .option('-d, --debug', '启用调试模式')
  .option('-l, --log-level <level>', '设置日志级别 (debug, info, warn, error)', 'info')
  .option('-p, --log-path <path>', '设置日志目录路径', path.join(process.cwd(), 'logs'))
  .action(async (options) => {
    // 显示Banner
    showBanner();
    
    // 设置环境变量
    process.env.DEBUG_MODE = options.debug ? 'true' : 'false';
    process.env.LOG_LEVEL = options.logLevel;
    
    // 确保日志目录存在
    const logDir = options.logPath;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    console.log('系统信息:');
    console.log(`- 操作系统: ${os.type()} ${os.release()}`);
    console.log(`- Node.js: ${process.version}`);
    console.log(`- 工作目录: ${process.cwd()}`);
    console.log(`- 日志级别: ${options.logLevel}`);
    console.log(`- 调试模式: ${options.debug ? '启用' : '禁用'}`);
    console.log(`- 日志目录: ${logDir}`);
    console.log('=================================================');
    
    console.log('开始启动MCP服务器...');
    
    try {
      // 启动服务器 - 注意这里只传递日志目录路径，由startServer函数负责生成完整的日志文件路径
      const result = await startServer({
        debug: options.debug,
        logLevel: options.logLevel,
        logDir: logDir  // 重命名参数为logDir，而不是logPath，更清晰表明这是一个目录
      });
      
      if (result && result.success) {
        console.log('MCP服务器启动成功!');
        console.log('服务器正在运行中，等待MCP连接...');
        console.log('按 Ctrl+C 停止服务器');
      } else {
        console.error('服务器启动失败!');
        process.exit(1);
      }
    } catch (error) {
      console.error('服务器启动错误:', error);
      process.exit(1);
    }
  });

// 显示工具列表命令
program
  .command('list-tools')
  .description('列出所有可用的MCP工具')
  .action(() => {
    console.log('=================================================');
    console.log('          可用MCP工具列表                        ');
    console.log('=================================================');
    console.log('文件操作:');
    console.log('- read_file: 读取文件内容');
    console.log('- write_file: 写入文件内容');
    console.log('- append_file: 追加文件内容');
    console.log('- delete_file: 删除文件');
    console.log('- copy_file: 复制文件');
    console.log('- move_file: 移动文件');
    console.log('- get_file_info: 获取文件信息');
    console.log('- file_exists: 检查文件是否存在');
    console.log('\n目录操作:');
    console.log('- list_directory: 列出目录内容');
    console.log('- create_directory: 创建目录');
    console.log('- remove_directory: 删除目录');
    console.log('- directory_exists: 检查目录是否存在');
    console.log('\n行操作:');
    console.log('- read_lines: 读取文件指定行');
    console.log('- write_lines: 写入文件指定行');
    console.log('- insert_line: 插入行');
    console.log('- delete_lines: 删除行');
    console.log('- search_file_content: 搜索文件内容');
    console.log('\n监控工具:');
    console.log('- watch_path: 监控文件或目录变更');
    console.log('- stop_watch: 停止监控');
    console.log('- list_watchers: 列出所有监控');
    console.log('\n系统工具:');
    console.log('- get_server_status: 获取服务器状态');
    console.log('=================================================');
  });

// 处理示例命令
program
  .command('example')
  .description('显示如何通过Node.js连接到MCP服务器的示例代码')
  .option('--npx', '显示使用npx的示例代码')
  .option('--electron', '显示在Electron中使用的示例代码')
  .action((options) => {
    showBanner();
    
    if (options.npx) {
      console.log('=================================================');
      console.log('      使用npx连接到MCP服务器示例代码              ');
      console.log('=================================================');
      console.log('```javascript');
      console.log('const { spawn } = require(\'child_process\');');
      console.log('const { McpClient } = require(\'@modelcontextprotocol/sdk/client/mcp.js\');');
      console.log('const { StdioClientTransport } = require(\'@modelcontextprotocol/sdk/client/stdio.js\');');
      console.log('');
      console.log('async function connectWithNpx() {');
      console.log('  // 使用npx启动MCP服务器');
      console.log('  const serverProcess = spawn(\'npx\', [\'@yinzhouzhi/mcp-filesystem-server\', \'start\'], {');
      console.log('    stdio: [\'pipe\', \'pipe\', \'pipe\']');
      console.log('  });');
      console.log('');
      console.log('  // 创建STDIO传输');
      console.log('  const transport = new StdioClientTransport({');
      console.log('    input: serverProcess.stdout,');
      console.log('    output: serverProcess.stdin,');
      console.log('    error: serverProcess.stderr');
      console.log('  });');
      console.log('');
      console.log('  // 创建客户端');
      console.log('  const client = new McpClient();');
      console.log('  await client.connect(transport);');
      console.log('');
      console.log('  // 调用工具示例');
      console.log('  const result = await client.invokeTool(\'read_file\', {');
      console.log('    path: \'./example.txt\',');
      console.log('    encoding: \'utf8\'');
      console.log('  });');
      console.log('');
      console.log('  console.log(\'文件内容:\', result);');
      console.log('');
      console.log('  // 关闭连接');
      console.log('  await client.disconnect();');
      console.log('  serverProcess.kill();');
      console.log('}');
      console.log('```');
    } else if (options.electron) {
      console.log('=================================================');
      console.log('      在Electron中使用MCP服务器示例代码           ');
      console.log('=================================================');
      console.log('```javascript');
      console.log('// 主进程中');
      console.log('const { app, BrowserWindow, ipcMain } = require(\'electron\');');
      console.log('const { McpClient } = require(\'@modelcontextprotocol/sdk/client/mcp.js\');');
      console.log('const { StdioClientTransport } = require(\'@modelcontextprotocol/sdk/client/stdio.js\');');
      console.log('const { spawn } = require(\'child_process\');');
      console.log('');
      console.log('let mcpClient = null;');
      console.log('let mcpServerProcess = null;');
      console.log('');
      console.log('async function setupMcpServer() {');
      console.log('  // 启动MCP文件系统服务器');
      console.log('  mcpServerProcess = spawn(\'npx\', [\'@yinzhouzhi/mcp-filesystem-server\', \'start\'], {');
      console.log('    stdio: [\'pipe\', \'pipe\', \'pipe\']');
      console.log('  });');
      console.log('');
      console.log('  // 创建传输层');
      console.log('  const transport = new StdioClientTransport({');
      console.log('    input: mcpServerProcess.stdout,');
      console.log('    output: mcpServerProcess.stdin,');
      console.log('    error: mcpServerProcess.stderr');
      console.log('  });');
      console.log('');
      console.log('  // 创建客户端并连接');
      console.log('  mcpClient = new McpClient();');
      console.log('  await mcpClient.connect(transport);');
      console.log('');
      console.log('  // 向渲染进程提供IPC接口');
      console.log('  ipcMain.handle(\'fs-tool\', async (event, toolName, params) => {');
      console.log('    try {');
      console.log('      return await mcpClient.invokeTool(toolName, params);');
      console.log('    } catch (error) {');
      console.log('      console.error(`执行工具 ${toolName} 失败:`, error);');
      console.log('      throw error;');
      console.log('    }');
      console.log('  });');
      console.log('}');
      console.log('');
      console.log('// 在应用启动时初始化');
      console.log('app.whenReady().then(setupMcpServer);');
      console.log('');
      console.log('// 应用退出时清理');
      console.log('app.on(\'will-quit\', async () => {');
      console.log('  if (mcpClient) {');
      console.log('    await mcpClient.disconnect();');
      console.log('  }');
      console.log('  if (mcpServerProcess) {');
      console.log('    mcpServerProcess.kill();');
      console.log('  }');
      console.log('});');
      console.log('```');
      console.log('');
      console.log('在渲染进程中使用:');
      console.log('```javascript');
      console.log('// 在渲染进程中调用MCP工具');
      console.log('async function readFile(path) {');
      console.log('  return await window.ipcRenderer.invoke(\'fs-tool\', \'read_file\', { path });');
      console.log('}');
      console.log('');
      console.log('// 调用示例');
      console.log('document.getElementById(\'readBtn\').addEventListener(\'click\', async () => {');
      console.log('  try {');
      console.log('    const content = await readFile(\'./example.txt\');');
      console.log('    document.getElementById(\'output\').textContent = content;');
      console.log('  } catch (error) {');
      console.log('    console.error(\'读取文件失败:\', error);');
      console.log('  }');
      console.log('});');
      console.log('```');
    } else {
      console.log('=================================================');
      console.log('      通过Node.js连接到MCP服务器示例代码          ');
      console.log('=================================================');
      console.log('```javascript');
      console.log('const { McpClient } = require(\'@modelcontextprotocol/sdk/client/mcp.js\');');
      console.log('const { StdioClientTransport } = require(\'@modelcontextprotocol/sdk/client/stdio.js\');');
      console.log('const { spawn } = require(\'child_process\');');
      console.log('');
      console.log('async function connectToMcpServer() {');
      console.log('  // 启动MCP服务器进程');
      console.log('  const serverProcess = spawn(\'mcp-filesystem-server\', [\'start\'], {');
      console.log('    stdio: [\'pipe\', \'pipe\', \'pipe\']');
      console.log('  });');
      console.log('');
      console.log('  // 创建STDIO传输');
      console.log('  const transport = new StdioClientTransport({');
      console.log('    input: serverProcess.stdout,');
      console.log('    output: serverProcess.stdin,');
      console.log('    error: serverProcess.stderr');
      console.log('  });');
      console.log('');
      console.log('  // 创建客户端');
      console.log('  const client = new McpClient();');
      console.log('  await client.connect(transport);');
      console.log('');
      console.log('  // 查看所有可用的示例:');
      console.log('  // npx @yinzhouzhi/mcp-filesystem-server example --npx');
      console.log('  // npx @yinzhouzhi/mcp-filesystem-server example --electron');
      console.log('');
      console.log('  // 调用工具示例');
      console.log('  const result = await client.invokeTool(\'read_file\', {');
      console.log('    path: \'./example.txt\',');
      console.log('    encoding: \'utf8\'');
      console.log('  });');
      console.log('');
      console.log('  console.log(\'文件内容:\', result);');
      console.log('');
      console.log('  // 关闭连接');
      console.log('  await client.disconnect();');
      console.log('  serverProcess.kill();');
      console.log('}');
      console.log('```');
    }
    
    console.log('=================================================');
    console.log('查看更多示例:');
    console.log('  npx @yinzhouzhi/mcp-filesystem-server example --npx       # 使用npx的示例');
    console.log('  npx @yinzhouzhi/mcp-filesystem-server example --electron  # 在Electron中使用的示例');
    console.log('=================================================');
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  showBanner();
  program.help();
}

// 处理进程退出
process.on('exit', () => {
  console.log('MCP服务器已关闭');
});

// 处理Ctrl+C
process.on('SIGINT', () => {
  console.log('接收到停止信号，MCP服务器即将关闭...');
  process.exit(0);
}); 