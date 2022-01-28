<?php

# Table numbers for beer are 51-83
# Table numbers for mead are 84-86
# Table numbers for cider are 87,88
# Table numbers for beer 89

# 2022
# Table numbers for beer are 51-88
# Table numbers for mead are 89-91
# Table numbers for cider are 92,93


use setasign\Fpdi;

require_once('fpdf182/fpdf.php');

require_once 'fpdi/src/autoload.php';

class PDF_Code39 extends FPDF
{
function Code39($xpos, $ypos, $code, $baseline=0.5, $height=5){

	$wide = $baseline;
	$narrow = $baseline / 3 ; 
	$gap = $narrow;

	$barChar['0'] = 'nnnwwnwnn';
	$barChar['1'] = 'wnnwnnnnw';
	$barChar['2'] = 'nnwwnnnnw';
	$barChar['3'] = 'wnwwnnnnn';
	$barChar['4'] = 'nnnwwnnnw';
	$barChar['5'] = 'wnnwwnnnn';
	$barChar['6'] = 'nnwwwnnnn';
	$barChar['7'] = 'nnnwnnwnw';
	$barChar['8'] = 'wnnwnnwnn';
	$barChar['9'] = 'nnwwnnwnn';
	$barChar['A'] = 'wnnnnwnnw';
	$barChar['B'] = 'nnwnnwnnw';
	$barChar['C'] = 'wnwnnwnnn';
	$barChar['D'] = 'nnnnwwnnw';
	$barChar['E'] = 'wnnnwwnnn';
	$barChar['F'] = 'nnwnwwnnn';
	$barChar['G'] = 'nnnnnwwnw';
	$barChar['H'] = 'wnnnnwwnn';
	$barChar['I'] = 'nnwnnwwnn';
	$barChar['J'] = 'nnnnwwwnn';
	$barChar['K'] = 'wnnnnnnww';
	$barChar['L'] = 'nnwnnnnww';
	$barChar['M'] = 'wnwnnnnwn';
	$barChar['N'] = 'nnnnwnnww';
	$barChar['O'] = 'wnnnwnnwn'; 
	$barChar['P'] = 'nnwnwnnwn';
	$barChar['Q'] = 'nnnnnnwww';
	$barChar['R'] = 'wnnnnnwwn';
	$barChar['S'] = 'nnwnnnwwn';
	$barChar['T'] = 'nnnnwnwwn';
	$barChar['U'] = 'wwnnnnnnw';
	$barChar['V'] = 'nwwnnnnnw';
	$barChar['W'] = 'wwwnnnnnn';
	$barChar['X'] = 'nwnnwnnnw';
	$barChar['Y'] = 'wwnnwnnnn';
	$barChar['Z'] = 'nwwnwnnnn';
	$barChar['-'] = 'nwnnnnwnw';
	$barChar['.'] = 'wwnnnnwnn';
	$barChar[' '] = 'nwwnnnwnn';
	$barChar['*'] = 'nwnnwnwnn';
	$barChar['$'] = 'nwnwnwnnn';
	$barChar['/'] = 'nwnwnnnwn';
	$barChar['+'] = 'nwnnnwnwn';
	$barChar['%'] = 'nnnwnwnwn';

	$this->SetFont('Arial','',15);
	$this->Text($xpos, $ypos + $height + .2, $code);
	$this->SetFillColor(0);

	$code = '*'.strtoupper($code).'*';
	for($i=0; $i<strlen($code); $i++){
		$char = $code[$i];
		if(!isset($barChar[$char])){
			$this->Error('Invalid character in barcode: '.$char);
		}
		$seq = $barChar[$char];
		for($bar=0; $bar<9; $bar++){
			if($seq[$bar] == 'n'){
				$lineWidth = $narrow;
			}else{
				$lineWidth = $wide;
			}
			if($bar % 2 == 0){
				$this->Rect($xpos, $ypos, $lineWidth, $height, 'F');
			}
			$xpos += $lineWidth;
		}
		$xpos += $gap;
	}
}
}


error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(30);

$table   = $_GET['table'];
$flight  = $_GET['flight'];
$name    = $_GET['name'];
$bjcpid  = $_GET['bjcpid'];
$email   = $_GET['email'];
$rank    = $_GET['rank'];
$round   = $_GET['round'];

$pdf = new Fpdi\Fpdi('P', 'in', 'Letter');

if ($table < 89)
{
	$pageCount = $pdf->setSourceFile('BBO_BeerScoreSheet.pdf');
}

if (($table >= 89) and ($table <= 91 ))
{
	$pageCount = $pdf->setSourceFile('BBO_MeadScoreSheet.pdf');
}

if (($table == 92) or ($table == 93))
{
	$pageCount = $pdf->setSourceFile('BBO_CiderScoreSheet.pdf');
}

$pageId = $pdf->importPage(1);

$mysqli = new mysqli('127.0.0.1', 'bbbrewof_bbuser', 'bb4beer', 'bcoem231');

if ($mysqli->connect_errno)
{
  echo "Database connect failed.<br>";
  echo "Errno: $mysqli->connect_errno <br>";
  echo "Error: $mysqli->connect_error <br>";
  exit;
}

if ($round == 1 )
{
	$sql = <<<EOT
	SELECT 
	  a.brewCategorySort,
	  a.brewSubCategory,
	  a.brewStyle,
	  a.brewJudgingNumber,
	  a.brewInfo,
	  a.brewMead1,
	  a.brewMead2,
	  a.brewMead3,
	  a.brewInfoOptional
	FROM 
	  brewing a,
	  judging_tables b,
	  judging_flights c
	WHERE
	      b.tableNumber = $table
	  and b.id = c.flightTable
	  and c.flightNumber = $flight
	  and a.id = c.flightEntryID
	ORDER by
	  a.brewCategorySort asc,
	  a.brewSubCategory asc,
	  a.brewJudgingNumber asc
EOT;
}


if ($round == 2 )
{
	$sql = <<<EOT
	SELECT 
	  a.brewCategorySort,
	  a.brewSubCategory,
	  a.brewStyle,
	  a.brewJudgingNumber,
	  a.brewInfo,
	  a.brewMead1,
	  a.brewMead2,
	  a.brewMead3,
    a.brewInfoOptional
	FROM 
	  brewing a,
	  judging_tables b,
	  judging_flights c,
	  judging_scores d
	WHERE
	      b.tableNumber = $table
	  and b.id = c.flightTable
	  and a.id = c.flightEntryID
	  and d.eid = a.id
	  and d.scoreMiniBOS = 1
	ORDER by
	  a.brewCategorySort asc,
	  a.brewSubCategory asc,
	  a.brewJudgingNumber asc
EOT;
}

if (!$result = $mysqli->query($sql)) {
    echo "Error: Our query failed to execute and here is why: \n";
    echo "Query: " . $sql . "<br>";
    echo "Errno: " . $mysqli->errno . "<br>";
    echo "Error: " . $mysqli->error . "<br>";
    exit;
}

if ($result->num_rows === 0) {
    echo "We could not find a match for table $table, flight $flight, Please try again.";
    exit;
}

while ($row = $result->fetch_assoc())
{
	$brewCategory      = $row['brewCategorySort'];
	$brewSubCategory   = $row['brewSubCategory'];
	$brewStyle         = $row['brewStyle'];
	$brewJudgingNumber = $row['brewJudgingNumber'];
	$brewInfo          = $row['brewInfo'];
	$brewMead1         = $row['brewMead1'];
	$brewMead2         = $row['brewMead2'];
	$brewMead3         = $row['brewMead3'];
	$brewInfoOptional  = $row['brewInfoOptional'];

//  echo "From DB: " . $entryNum . "," . $row['brewStyle'] . "," . $row['brewCategorySort'] . "," . $row['brewCategory'] . $row['brewSubCategory'] . "," . $row['brewJudgingNumber'] . "," .$row['brewBoxNum'] . "<br>";
$pdf->AddPage('P', 'Letter');
$pdf->SetDisplayMode('fullpage','single');
//$pdf->SetMargins(0,0,8.5);


$pdf->useTemplate($pageId, 0, 0, 8.5, 11);

$pdf->Code39(6.9,1.65,$brewJudgingNumber,.03,.3);


// Left Side

$pdf->SetMargins(.325, .25, 5);
$pdf->SetXY(.325, 1.75);

/*
$pdf->SetFont('Arial', 'B', 9);
$pdf->Write(0, 'Judge Name: ');
$pdf->Ln(.125);$pdf->Ln(.125);
$pdf->Write(0, 'Judge BJCP ID: ');
$pdf->Ln(.125);$pdf->Ln(.125);
$pdf->Write(0, 'Rank/Qual: ');
$pdf->Ln(.125);$pdf->Ln(.125);
$pdf->Write(0, 'Judge Email: ');



$pdf->SetMargins(1.3, .25, 5);

$pdf->SetFont('Arial', '', 11);
$pdf->SetXY(1.3, 1.6875);
$pdf->Write(.125, $name);

$pdf->SetXY(1.3, 1.9375);
$pdf->Write(.125, $bjcpid);

$pdf->SetXY(1.3, 2.1875);
$pdf->Write(.125, $rank);

$pdf->SetXY(1.3, 2.4375);
$pdf->Write(.125, $email);
*/

//Right Side

$pdf->SetMargins(3.65, .25, 1.75);
$pdf->SetFont('Arial', '', 9);
$pdf->SetXY(5.9, 1.4);
if ($round == 1)
{
	$pdf->Write(.125, "R$round" . "T$table" . "F$flight");
}
else
{
	$pdf->Write(.125, "R$round" . "T$table");
}

# Beer
if ($table < 89) # beer
{
	$pdf->SetMargins(3.65, .25, 1.75);
	$pdf->SetXY(3.65, 1.75);
	
	$pdf->SetFont('Arial', 'B', 9);
	$pdf->Write(0, 'Category: ');
	$pdf->SetX(4.75);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.15);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.125);$pdf->Ln(.125);
	$pdf->Write(0, 'Beer Info: ');
	
	$pdf->SetFont('Arial', '', 11);
	$pdf->SetXY(4.3, 1.6875);
	$pdf->Write(.125, $brewCategory);
	
	$pdf->SetXY(5.6, 1.6875);
	$pdf->Write(.125, $brewSubCategory);
	
	$pdf->SetFont('Arial', '', 10);
	$pdf->SetXY(4.5, 1.848);
	$pdf->Write(.125, $brewStyle);
	
	$brewInfo = str_replace("\n", " ", $brewInfo);
	$brewInfo = str_replace("^",  ";", $brewInfo);
	$pdf->SetXY(4.25, 2.073);
	$pdf->Write(.125, $brewInfo);
	
}

# Mead
if (($table >= 89) and ($table <= 91))
{
	$pdf->SetMargins(3.65, .25, 1.75);
	$pdf->SetXY(3.65, 1.75);
	
	$pdf->SetFont('Arial', 'B', 9);
	$pdf->Write(0, 'Category: ');
	$pdf->SetX(4.75);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.15);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.125);$pdf->Ln(.125);
	$pdf->Write(0, 'Mead Info: ');
	$pdf->Ln(.125);$pdf->Ln(.125);$pdf->Ln(.125);$pdf->Ln(.125);
	$pdf->Write(0, 'Carbonation, Sweetness, Strength:');
	
	$pdf->SetFont('Arial', '', 11);
	$pdf->SetXY(4.3, 1.6875);
	$pdf->Write(.125, $brewCategory);
	
	$pdf->SetXY(5.6, 1.6875);
	$pdf->Write(.125, $brewSubCategory);
	
	$pdf->SetFont('Arial', '', 10);
	$pdf->SetXY(4.5, 1.848);
	$pdf->Write(.125, $brewStyle);
	
	$brewInfo = str_replace("\n", " ", $brewInfo);
	$brewInfo = str_replace("^",  ";", $brewInfo);
	$pdf->SetXY(4.3, 2.073);
	$pdf->Write(.125, $brewInfo . " " . $brewInfoOptional);

  $pdf->SetMargins(3.65, .25, .5);
	$pdf->SetXY(5.75, 2.575);
	$pdf->Write(.125, $brewMead1 . ", " . $brewMead2 . ", " . $brewMead3);
	
}

# Cider
if ($table >= 92)
{
	$pdf->SetMargins(3.65, .25, 1.75);
	$pdf->SetXY(3.65, 1.75);
	
	$pdf->SetFont('Arial', 'B', 9);
	$pdf->Write(0, 'Category: ');
	$pdf->SetX(4.75);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.15);
	$pdf->Write(0, 'Subcategory: ');
	$pdf->Ln(.125);$pdf->Ln(.125);
	$pdf->Write(0, 'Cider Info: ');
	$pdf->Ln(.125);$pdf->Ln(.125);$pdf->Ln(.125);$pdf->Ln(.125);
	$pdf->Write(0, 'Carbonation, Sweetness:');
	
	$pdf->SetFont('Arial', '', 11);
	$pdf->SetXY(4.3, 1.6875);
	$pdf->Write(.125, $brewCategory);
	
	$pdf->SetXY(5.6, 1.6875);
	$pdf->Write(.125, $brewSubCategory);
	
	$pdf->SetFont('Arial', '', 10);
	$pdf->SetXY(4.5, 1.848);
	$pdf->Write(.125, $brewStyle);
	
	$brewInfo = str_replace("\n", " ", $brewInfo);
	$brewInfo = str_replace("^",  ";", $brewInfo);
	$pdf->SetXY(4.3, 2.073);
	$pdf->Write(.125, $brewInfo);

  $pdf->SetMargins(3.65, .25, .5);
	$pdf->SetXY(5.25, 2.575);
	$pdf->Write(.125, $brewMead1 . ", " . $brewMead2);
	
}

}

$result->free();
$mysqli->close();
$pdf->Output();
unset($pdf);


?>
