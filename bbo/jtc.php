<?php

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(30);

//$table   = $_GET['table'];

require '../paths.php';
require '../site/config.php';
$connection = new mysqli($hostname, $username, $password, $database);

if ($connection->connect_errno)
{
  echo "Database connect failed.<br>";
  echo "Errno: $connection->connect_errno <br>";
  echo "Error: $connection->connect_error <br>";
  exit;
}

// Read the styles table into the $BBOBnumToBJCP array
// First query

$BBOsql = <<<EOT
SELECT id, brewStyleGroup, brewStyleNum FROM styles
EOT;

if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query3 failed to execute and here is why: \n";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
}

if ($BBOresult->num_rows === 0) {
    echo "Query3 no rows found.";
    exit;
}

$BBOBnumToBJCP = array();

while ($BBOrow = $BBOresult->fetch_assoc())
{
	$BBOxrefId  = $BBOrow['id'];
	$BBOxrefBrewStyleGroup  = $BBOrow['brewStyleGroup'];
	$BBOxrefBrewStyleNum  = $BBOrow['brewStyleNum'];

  $BBOBnumToBJCP["$BBOxrefId"] = $BBOxrefBrewStyleGroup . "-" . $BBOxrefBrewStyleNum;
}

/* 
  Data from styles table
  $BBOBnumToBJCP['99'] => '01-A'
*/

//echo "<br>";
//foreach($BBOBnumToBJCP as $BBOkey => $BBOvalue)
//{
//  echo "BNum=" . $BBOkey . ", BJCPNum=" . $BBOvalue;
//  echo "<br>";
//}

// Read counts of subcategory entries from the brewing table into the $BBOSubCatCount array.
// Prepare the "table" array in the $BBOSubCatCount array initialize to zeros
// Second query

$BBOsql = <<<EOT
SELECT brewCategorySort, brewSubCategory, count(*)
FROM brewing
GROUP by 1,2
EOT;

if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query1 failed to execute and here is why: \n";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
}

//if ($BBOresult->num_rows === 0) {
//    echo "Query1 no rows found.";
//    exit;
//}

$BBOSubCatCount = array();

while ($BBOrow = $BBOresult->fetch_assoc())
{
	$BBObrewCategorySort = $BBOrow['brewCategorySort'];
	$BBObrewSubCategory  = $BBOrow['brewSubCategory'];
	$BBOcount            = $BBOrow['count(*)'];
	$BBOBJCPSubCat			 = $BBObrewCategorySort . "-" . $BBObrewSubCategory;

  //echo "From DB: " . $brewCategorySort . ", " .  $brewSubCategory . ", " . $count . "<br>";
  
  $BBOSubCatCount["$BBOBJCPSubCat"]['count'] = $BBOcount;
  $BBOSubCatCount["$BBOBJCPSubCat"]['table'] = 0;
}

/*
  Data from brewing table
	$BBOSubCatCount['01-A'] => ['count'] => 38; the number of entries in the style 
	$BBOSubCatCount['01-A'] => ['table'] => 0; initializes table key to zero
*/

//var_dump($BBOSubCatCount);

//echo "<br>";

//foreach($BBOSubCatCount as $BBOkey => $BBOvalue)
//{
//  echo "Subcat=" . $BBOkey . ", Count=" . $BBOvalue['count'];
//  echo "<br>";
//}

// The judging tables table


$BBOsql = <<<EOT
SELECT tableNumber, tableStyles FROM judging_tables
EOT;

if (!$BBOresult = $connection->query($BBOsql)) {
    echo "Error: Query2 failed to execute and here is why: \n";
    echo "Query: " . $BBOsql . "<br>";
    echo "Errno: " . $connection->errno . "<br>";
    echo "Error: " . $connection->error . "<br>";
    exit;
}

if ($BBOresult->num_rows === 0) {
    echo "Query2 no rows found.";
    exit;
}

$BBOtables = array();

while ($BBOrow = $BBOresult->fetch_assoc())
{
	$BBOtableNumber  = $BBOrow['tableNumber'];
	$BBOtableStyles  = $BBOrow['tableStyles'];

  $BBOtables["$BBOtableNumber"]['styles'] = $BBOtableStyles;
  $BBOtables["$BBOtableNumber"]['count'] = 0;
}

/*
  Data from judging_tables table
  $BBOtables['51'] => ['styles'] => '99,100,103'
  $BBOtables['51'] => ['count'] => 0
*/

//var_dump($BBOtables);

//echo "<br>";
//foreach($BBOtables as $BBOkey => $BBOvalue)
//{
//  echo "TableNum=" . $BBOkey . ", ValueStyles=" . $BBOvalue['styles'] . ", ValueCount=" . $BBOvalue['count'];
//  echo "<br>";
//}


foreach($BBOtables as $BBOkey => $BBOvalue)
{
	$BBOBNumsArray = explode(',', $BBOvalue['styles']);
  foreach ($BBOBNumsArray as $BBObnum)
  {
  	if (isset($BBOSubCatCount[$BBOBnumToBJCP["$BBObnum"]]))
  	{
      $BBOtables[$BBOkey]['count'] += $BBOSubCatCount[$BBOBnumToBJCP["$BBObnum"]]['count'];
      $BBOSubCatCount[$BBOBnumToBJCP["$BBObnum"]]['table'] = $BBOkey;
    }
    else // The subcat count was not created because it was not in the brewing table. Here we create it in the $BBOSubCatCount structure and set the value to zero. This will make the building of the selection box work in add or modify entry pages.
    {
     	$BBOSubCatCount[$BBOBnumToBJCP["$BBObnum"]]['count'] = 0;
     	$BBOSubCatCount[$BBOBnumToBJCP["$BBObnum"]]['table'] = $BBOkey;
    }
  }
}

/*
  $BBOtables['51'] => ['styles'] => '99,100,103'
  $BBOtables['51'] => ['count'] => has number of entries in the table
  $BBOSubCatCount['01-A']['table'] => 51;
*/

foreach($BBOtables as $BBOkey => $BBOvalue)
{
	echo $BBOkey . "=" . $BBOvalue['count'] . "<br>";
}

//foreach($BBOSubCatCount as $BBOkey => $BBOvalue)
//{
//  echo "Subcat=" . $BBOkey . ", Count=" . $BBOvalue['count'] . ", table=" . $BBOvalue['table'] ;
//  echo "<br>";
//}




$BBOresult->free();
//$connection->close();

/*
$languages = array(); 
  
$languages['Python'] = array( 
    "first_release" => "1991",  
    "latest_release" => "3.8.0",  
    "designed_by" => "Guido van Rossum", 
    "description" => array( 
        "extension" => ".py",  
        "typing_discipline" => "Duck, dynamic, gradual", 
        "license" => "Python Software Foundation License"
    ) 
); 
  
$languages['PHP'] = array( 
    "first_release" => "1995",  
    "latest_release" => "7.3.11",  
    "designed_by" => "Rasmus Lerdorf", 
    "description" => array( 
        "extension" => ".php",  
        "typing_discipline" => "Dynamic, weak", 
        "license" => "PHP License (most of Zend engine 
             under Zend Engine License)" 
    ) 
); 


echo $languages["Python"]["latest_release"];echo "<br>"; 

print_r($languages); 
*/

?>
