import path from 'path';
import { fileURLToPath } from 'url';
import { McpHub } from './McpHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Starting MASTER_MCP Hub Test...");

  // Define the path to the tool registry relative to this script
  const registryPath = path.resolve(__dirname, '../tool-registry/master.json');

  console.log(`Using tool registry at: ${registryPath}`);

  // Instantiate the hub
  const hub = new McpHub({ registryPath });

  try {
    // Initialize the hub (loads registry, connects to servers)
    await hub.initialize();

    // Get the list of all tools discovered from all connected servers
    const allTools = await hub.getTools();

    console.log("\n✅ Hub Initialized Successfully!");
    console.log("=========================================");
    console.log("Discovered Tools:");
    console.log("=========================================");

    if (allTools.length > 0) {
      allTools.forEach(tool => {
        console.log(`- ${tool.name}`);
        // console.log(`  Description: ${tool.description}`);
      });
    } else {
      console.log("No tools were discovered. Check the tool server configurations and connections.");
    }
    console.log("=========================================");

    // --- Live Execution Test ---
    console.log("\nPerforming RAG workflow test...");
    console.log("=========================================");
    
    const indexDir = '..'; // The root of the MASTER_MCP project
    const searchQuery = 'Gateway';

    try {
      // 1. Create the index
      console.log(`Attempting to execute 'local_rag__create_index' on directory '${indexDir}'...`);
      const indexResult = await hub.execute('local_rag__create_index', { 
        index_name: 'test_index',
        directory_path: indexDir 
      });
      if (indexResult.ok) {
        const indexText = indexResult.content.find(c => c.type === 'text')?.text || "(No summary returned)";
        console.log("\n✅ Indexing complete!");
        console.log(indexText);
      } else {
        throw new Error(`Indexing failed: ${indexResult.message}`);
      }

      // 2. Search the index
      console.log(`\nAttempting to execute 'local_rag__search_index' with query '${searchQuery}'...`);
      const searchResult = await hub.execute('local_rag__search_index', { 
        index_name: 'test_index',
        query: searchQuery 
      });
      if (searchResult.ok) {
        const searchText = searchResult.content.find(c => c.type === 'text')?.text || "(No results found)";
        console.log("\n✅ Search complete!");
        console.log("--- Search Results ---");
        console.log(searchText);
        console.log("----------------------");
      } else {
        throw new Error(`Search failed: ${searchResult.message}`);
      }

    } catch (e) {
      console.error(`\n❌ An error occurred during the RAG workflow test: ${e.message}`);
    }
    console.log("=========================================");


  } catch (error) {
    console.error("\n❌ An error occurred during hub initialization:", error);
  } finally {
    // In a real server, we wouldn't exit, but for a test script, we can.
    // Forcibly exit because some tool servers running via stdio might keep the process alive.
    console.log("\nTest complete. Exiting.");
    process.exit(0);
  }
}

main();
