<?php

$header = <<<EOT
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="generator" content="CoffeeCup HTML Editor (www.coffeecup.com)">
    <meta name="dcterms.created" content="Sat, 24 Dec 2016 16:01:33 GMT">
    <meta name="description" content="">
    <meta name="keywords" content="">
    <title>Bluebonnet Audit Sheet Generation</title>
    
    <style type="text/css">
    <!--
    body {
      color:#000000;
      background-color:#FFFFFF;
      background-image:url('Background Image');
      background-repeat:no-repeat;
    }
    a  { color:#0000FF; }
    a:visited { color:#800080; }
    a:hover { color:#008000; }
    a:active { color:#FF0000; }
	tr:nth-of-type(odd) { background-color:#ccc; }
	tr {vertical-align:middle; text-align:center;}



    -->
    </style>
    <!--[if IE]>
    <script src="http://html5shim.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->
  </head>
  <body>
  	<div align="center"><h1>Bluebonnet Audit Sheet Printing Page</h1></div>

<form action="AuditSheet.php" method="get" target="_blank">
  Select 1st or 2nd Round Audit sheets:<br>
  <input type="radio" name="round" value="1" checked="checked"> 1st Round <br>
  <input type="radio" name="round" value="2">                   2nd Round <br>         

  
  <input type="submit" value="Generate Audit Sheets">
</form> 

</body></html>

EOT;

echo $header;

?>
