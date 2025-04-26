const fs = require('fs');
const path = require('path');
const { watchTools } = require('../tools');

// 示例目录和文件路径
const EXAMPLE_DIR = path.join(__dirname, '../../temp/watch-example');
const TEST_FILE = path.join(EXAMPLE_DIR, 'test-file.txt');
const TEST_DIR = path.join(EXAMPLE_DIR, 'sub-dir');

/**
 * 初始化示例环境
 */
async function setup() {
  console.log('=== 初始化示例环境 ===');
  
  // 确保示例目录存在
  if (!fs.existsSync(EXAMPLE_DIR)) {
    fs.mkdirSync(EXAMPLE_DIR, { recursive: true });
    console.log(`创建示例目录: ${EXAMPLE_DIR}`);
  }
  
  // 确保测试文件存在
  fs.writeFileSync(TEST_FILE, '这是示例文件的初始内容。\n', 'utf8');
  console.log(`创建测试文件: ${TEST_FILE}`);
  
  // 确保测试子目录存在
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    console.log(`创建子目录: ${TEST_DIR}`);
  }
}

/**
 * 监控单个文件示例
 */
function monitorSingleFile() {
  console.log('\n=== 监控单个文件 ===');
  
  // 设置文件变更回调
  const fileWatcher = watchTools.setFileChangeCallback(
    TEST_FILE,
    (event, filePath) => {
      console.log(`[文件事件] ${event}: ${filePath}`);
      
      // 如果文件被删除，打印特别提示
      if (event === 'unlink') {
        console.log('文件已被删除，但监控仍在运行');
      }
      
      // 如果文件发生变更，读取并打印内容
      if (event === 'change') {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          console.log(`文件内容: "${content.trim()}"`);
        } catch (error) {
          console.log(`无法读取文件内容: ${error.message}`);
        }
      }
    },
    { ignoreInitial: true }
  );
  
  if (fileWatcher) {
    console.log(`成功设置文件监控: ${TEST_FILE}`);
    return fileWatcher;
  } else {
    console.error(`无法监控文件: ${TEST_FILE}`);
    return null;
  }
}

/**
 * 监控目录示例
 */
function monitorDirectory() {
  console.log('\n=== 监控目录 ===');
  
  // 设置目录变更回调
  const dirWatcher = watchTools.setDirChangeCallback(
    EXAMPLE_DIR,
    (event, itemPath) => {
      console.log(`[目录事件] ${event}: ${itemPath}`);
      
      // 对于新增文件，打印文件类型
      if (event === 'add') {
        try {
          const stats = fs.statSync(itemPath);
          console.log(`新增文件大小: ${stats.size} 字节`);
        } catch (error) {
          console.log(`无法获取文件信息: ${error.message}`);
        }
      }
    },
    { ignoreInitial: true }
  );
  
  if (dirWatcher) {
    console.log(`成功设置目录监控: ${EXAMPLE_DIR}`);
    return dirWatcher;
  } else {
    console.error(`无法监控目录: ${EXAMPLE_DIR}`);
    return null;
  }
}

/**
 * 修改示例文件，触发回调
 */
async function modifyFiles() {
  console.log('\n=== 触发文件变更事件 ===');
  
  // 等待3秒，确保监控已经设置好
  console.log('等待3秒...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 1. 追加内容到文件
  console.log('\n1. 追加内容到文件');
  fs.appendFileSync(TEST_FILE, '这是追加的内容。\n', 'utf8');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 2. 覆盖文件内容
  console.log('\n2. 覆盖文件内容');
  fs.writeFileSync(TEST_FILE, '这是全新的内容。\n', 'utf8');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 3. 删除文件
  console.log('\n3. 删除文件');
  fs.unlinkSync(TEST_FILE);
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 4. 创建新文件
  console.log('\n4. 创建新文件');
  fs.writeFileSync(TEST_FILE, '文件已重新创建。\n', 'utf8');
  
  // 5. 创建子目录文件
  console.log('\n5. 在子目录创建新文件');
  fs.writeFileSync(
    path.join(TEST_DIR, 'subfile.txt'),
    '这是子目录中的文件。\n',
    'utf8'
  );
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * 关闭监控示例
 */
async function closeWatchers(fileWatcher, dirWatcher) {
  console.log('\n=== 关闭监控 ===');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 关闭文件监控
  if (fileWatcher) {
    await fileWatcher.close();
    console.log('文件监控已关闭');
  }
  
  // 关闭目录监控
  if (dirWatcher) {
    await dirWatcher.close();
    console.log('目录监控已关闭');
  }
  
  // 显示监控池状态
  const poolStatus = watchTools.getMonitorPoolStatus();
  console.log('监控池状态:', poolStatus);
  
  // 列出所有监控
  const watchersList = await watchTools.listWatchers();
  console.log('剩余活跃监控:', watchersList.count);
}

/**
 * 清理示例环境
 */
async function cleanup() {
  console.log('\n=== 清理示例环境 ===');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // 删除测试文件
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
    
    // 删除子目录中的文件
    const subFile = path.join(TEST_DIR, 'subfile.txt');
    if (fs.existsSync(subFile)) {
      fs.unlinkSync(subFile);
    }
    
    // 删除子目录
    if (fs.existsSync(TEST_DIR)) {
      fs.rmdirSync(TEST_DIR);
    }
    
    // 删除示例目录
    // 注释: 如果您想保留示例目录以便检查，可以注释掉下面这行
    if (fs.existsSync(EXAMPLE_DIR)) {
      fs.rmdirSync(EXAMPLE_DIR);
    }
    
    console.log('清理完成');
  } catch (error) {
    console.error('清理过程中出错:', error);
  }
}

/**
 * 运行完整示例
 */
async function runExample() {
  console.log('开始文件监控示例演示...\n');
  
  try {
    // 设置示例环境
    await setup();
    
    // 监控文件和目录
    const fileWatcher = monitorSingleFile();
    const dirWatcher = monitorDirectory();
    
    // 修改文件以触发事件
    await modifyFiles();
    
    // 关闭监控
    await closeWatchers(fileWatcher, dirWatcher);
    
    // 清理示例环境
    await cleanup();
    
    console.log('\n示例演示完成！');
  } catch (error) {
    console.error('示例运行出错:', error);
  }
}

// 运行示例
runExample().catch(console.error); 