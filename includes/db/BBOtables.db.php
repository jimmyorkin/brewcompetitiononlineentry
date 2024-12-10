<?php

//error_reporting(E_ALL);
//ini_set('display_errors', 1);
//set_time_limit(30);

//$table   = $_GET['table'];

//$connection = new mysqli('127.0.0.1', 'bcoem', 'bcoempw', 'bcoem-limbo');
/*
if ($connection->connect_errno)
{
  echo "Database connect failed.<br>";
  echo "Errno: $connection->connect_errno <br>";
  echo "Error: $connection->connect_error <br>";
  exit;
}
*/

function BBOgetEntrantTableCount(&$BBOentrantTableCount, $BBObrewerID, $BBOTables, $connection)
{
	$BBOsql = <<<EOT
  SELECT brewCategorySort, brewSubCategory
  FROM brewing
  where brewBrewerID = $BBObrewerID
EOT;

	if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query3 failed to execute and here is why: <br>";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
	}
    
  while ($BBOrow = $BBOresult->fetch_assoc())
	{
		$BBObrewCategorySort = $BBOrow['brewCategorySort'];
		$BBObrewSubCategory  = $BBOrow['brewSubCategory'];
		$BBOBCOEMSubCat			 = $BBObrewCategorySort . "-" . $BBObrewSubCategory;
		
//	            $BBOTables['TableStyles']['TableNumber']['01-A'] == 51; Style 01-A is in table 51
		$BBOtable = $BBOTables['TableStyles']['TableNumber'][$BBOBCOEMSubCat];
		
		if (array_key_exists($BBOtable, $BBOentrantTableCount))
			{
				$BBOentrantTableCount[$BBOtable]++;
			}
		else
			{
				$BBOentrantTableCount[$BBOtable] = 1;
			}
	}
}

// Read the Bluebonnet table definitions into $BBOTables['TableStyles']['TableNumber'] array
// First query

$BBOsql = <<<EOT
SELECT tableNumber, style, tableName FROM bbo_tables;
EOT;

if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query1 failed to execute and here is why: <br>";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
}

if ($BBOresult->num_rows == 0) {
    echo "<br>Query1 no rows found.<br>";
    exit;
}

$BBOTables = array();
$BBOTables['TableEntryCounts'] = array();
$BBOTables['TableStyles'] = array();
$BBOTables['TableStyles']['TableNumber'] = array();
$BBOTables['TableStyles']['StyleEntryCounts'] = array();

// $BBOTables['TableEntryCounts']['51']['Count'] = 20; 20 entries in table 51
// $BBOTables['TableEntryCounts']['51']['Name'] = 'Light Lagers and Ales'; Name of table 51
// $BBOTables['TableStyles']['TableNumber']['01-A'] = 51; Style 01-A is in table 51
// $BBOTables['TableStyles']['StyleEntryCounts']['01-A'] = 21; Style 01-A has 21 entries

while ($BBOrow = $BBOresult->fetch_assoc())
{
	$BBOTables['TableEntryCounts'][intval($BBOrow['tableNumber'])]['Count']  = 0; // initialze Table Entry Counts to zero
	$BBOTables['TableEntryCounts'][intval($BBOrow['tableNumber'])]['Name']   = $BBOrow['tableName']; // initialze Table Entry Counts to zero
	
	
	// This code converts the '1A' to '01-A' format
	$BBOStyleFixup = $BBOrow['style'];
	if ((is_numeric(substr($BBOStyleFixup, 0, 1))) && (!is_numeric(substr($BBOStyleFixup, 1, 1))))
	{ // We are in the 1 - 9 categories
		 	$BBOStyleFixup = sprintf("%02u", substr($BBOStyleFixup, 0, 1)) . "-" . substr($BBOStyleFixup, 1);
	}
	else
	{
	 	$BBOStyleFixup = substr($BBOStyleFixup, 0, 2) . '-' . substr($BBOStyleFixup, 2);
	}
	$BBOTables['TableStyles']['TableNumber'][$BBOStyleFixup] = intval($BBOrow['tableNumber']);
	$BBOTables['TableStyles']['StyleEntryCounts'][$BBOStyleFixup] = 0;

}

//echo '<pre>';                   
//print_r($BBOTables);            
//echo  '</pre>';
/*
foreach($BBOTables['TableEntryCounts'] as $BBOkey => $BBOvalue)
{
  echo "Key=" . $BBOkey . ", Value=" . $BBOvalue;
  echo "<br>";
}

foreach($BBOTables['TableStyles']['TableNumber'] as $BBOkey => $BBOvalue)
{
  echo "Key=" . $BBOkey . ", Value=" . $BBOvalue;
  echo "<br>";
}

exit;

*/

// Second query

$BBOsql = <<<EOT
SELECT brewCategorySort, brewSubCategory, count(*)
FROM brewing
GROUP by 1,2
EOT;

if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query2 failed to execute and here is why: <br>";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
}

if ($BBOresult->num_rows == 0) {
//echo "Query2 no rows found.";
  $BBOresult->free();
  return;
}

while ($BBOrow = $BBOresult->fetch_assoc())
{
	$BBObrewCategorySort = $BBOrow['brewCategorySort'];
	$BBObrewSubCategory  = $BBOrow['brewSubCategory'];
	$BBOcount            = $BBOrow['count(*)'];
	$BBOBCOEMSubCat			 = $BBObrewCategorySort . "-" . $BBObrewSubCategory;

  //echo "From DB: " . $brewCategorySort . ", " .  $brewSubCategory . ", " . $count . "<br>";
  
  $BBOTables['TableStyles']['StyleEntryCounts'][$BBOBCOEMSubCat] = intval($BBOcount);
  $BBOTables['TableEntryCounts'][$BBOTables['TableStyles']['TableNumber'][$BBOBCOEMSubCat]]['Count'] += $BBOcount;
  
}

$BBOresult->free();

//echo '<pre>';                                   
//print_r($BBOTables);                            
//echo  '</pre>';

?>
