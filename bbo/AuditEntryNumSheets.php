<?php

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

class PDF extends Fpdi\Fpdi
{
// Page header
function Header()
{
    // Logo
    // Arial bold 15
    $this->SetFont('Arial','B',15);
    $this->SetLeftMargin(.3937);
    $this->SetX(.3937);
    // Move to the right
//    $this->Cell(2);
    // Title
    $this->Cell(0,.5,'Bluebonnet Brewoff Entry Number Audit Sheet',1,0,'C');
    // Line break
    $this->Ln(.5);
}

// Page footer
function Footer()
{
    // Position at 1.5 cm from bottom
    $this->SetY(-0.5);
    $this->SetX(.3937);
    // Arial italic 8
    $this->SetFont('Arial','I',8);
    // Page number
    $this->Cell(0,.2,'Page '.$this->PageNo().'/{nb}',0,0,'C');
}
}

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(30);

$pdf = new PDF('P', 'in', 'Letter');
$pdf->AliasNbPages();

$mysqli = new mysqli('127.0.0.1', 'bbbrewof_bbuser', 'bb4beer', 'bcoem231');

if ($mysqli->connect_errno)
{
  echo "Database connect failed.<br>";
  echo "Errno: $mysqli->connect_errno <br>";
  echo "Error: $mysqli->connect_error <br>";
  exit;
}


	$sql = <<<EOT
	SELECT 
	  b.tableNumber,
	  b.tableName,
	  a.id
	FROM 
	  brewing a,
	  judging_tables b,
	  judging_flights c
	WHERE
	      b.id = c.flightTable
	  and a.id = c.flightEntryID
  ORDER by 1,3
EOT;

if (!$result = $mysqli->query($sql)) {
    echo "Error: Our query failed to execute and here is why: \n";
    echo "Query: " . $sql . "<br>";
    echo "Errno: " . $mysqli->errno . "<br>";
    echo "Error: " . $mysqli->error . "<br>";
    exit;
}

if ($result->num_rows === 0) {
    echo "No rows returned, Please try again.";
    exit;
}

$oldtableNum  = 0;
$entries      = 0;
$newColumn    = 0;


while ($row = $result->fetch_assoc())
{
	$tableNumber       = $row['tableNumber'];     
	$tableName         = $row['tableName'];
	$id                = $row['id'];
	
	if ($oldtableNum <> $tableNumber)
	{
		$entries = 0;
		$newColumn = 0;
		$pdf->AddPage('P', 'Letter');
	  $pdf->SetDisplayMode('fullpage','single');
	  
	  $pdf->SetLeftMargin(.3937);
	  
	  $oldtableNum  = $tableNumber;
	  
	  $pdf->SetFont('Arial', 'B', 14);
	  
	  $pdf->Cell(0, .4, "Table: T$tableNumber $tableName", 1, 0, 'C' );
	  $pdf->SetY(1.5);
	  $pdf->Cell(1.75, .4, "Entry Number", 1, 0, 'C' );
	  $pdf->Cell(1.25, .4, "Put in Box", 1, 1, 'C' );
	}

$entries++;

$pdf->Cell(1.75, .4, "E" . $id, 1, 0, 'C' );
$pdf->Cell(1.25, .4, "", 1, 1, 'C' );

	if (($entries > 18) && ($newColumn == 0))
	{
	 $pdf->SetLeftMargin(4.5);
//	 $pdf->SetX(5);
	 $pdf->SetY(1.5);
   $pdf->Cell(1.75, .4, "Entry Number", 1, 0, 'C' );
	 $pdf->Cell(1.25, .4, "Put in Box", 1, 1, 'C' );

	 $newColumn = 1;
	}
}

$result->free();
$mysqli->close();
$pdf->Output();
unset($pdf);


?>
