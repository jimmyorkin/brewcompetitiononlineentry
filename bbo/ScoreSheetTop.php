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
    <title>Bluebonnet Score Sheet Generation</title>
    
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

    -->
    </style>
    <!--[if IE]>
    <script src="http://html5shim.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->
  </head>
  <body>
  	<div align="left"><h1>Bluebonnet Score Sheet Printing Page</h1></div>

<form id="myForm" action="ScoreSheet.php" method="get" target="_blank">
	
 <input type="button" onclick="myFunction()" value="Reset form"> <br>
  Select 1st or 2nd Round Scoresheets:<br>
  <input type="radio" name="round" value="1" checked="checked"> 1st Round <br>
  <input type="radio" name="round" value="2">                   2nd Round <br>

<br>  Enter the Table number and Flight number below for your Score Sheets:<br>

	<table width="50%" border="2" cellpadding="2" cellspacing="2" style="background-color: #ffffff;">
<tr valign="top">
<td align="left" style="border-width : 0px;">Table Number: <input type="text" name="table" size="2">
</td>
<td align ="left" style="border-width : 0px;">Flight Number: <input type="text" name="flight" size="1">
</td>
</tr>
</table>

<br>
  Judge Name:
  <input type="text" name="name" size="50">
  <br>
  Judge BJCP ID:
  <input type="text" name="bjcpid" size="5">
  <br>
  Judge Email:
  <input type="email" name="email" size="50">
  <br><br>
<div style=" text-align: left; text-indent: 0px; padding: 0px 0px 0px 0px; margin: 0px 0px 0px 0px;">
	
<table width="50%" border="2" cellpadding="2" cellspacing="2" style="background-color: #ffffff;">

<tr valign="top">
<td align="left" style="border-width : 0px;">  Judge BJCP Rank:<br><br />
</td>
<td align ="left" style="border-width : 0px;">Non-BJCP:<br><br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">  <input type="radio" name="rank" value="Apprentice">                           Apprentice          <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="" checked="checked">                   Blank               <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">  <input type="radio" name="rank" value="Recognized">                           Recognized         <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Novice">                               Novice              <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">  <input type="radio" name="rank" value="Certified">                            Certified           <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Experienced">                          Experienced              <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">    <input type="radio" name="rank" value="National">                             National            <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Professional Brewer">                  Professional Brewer <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">      <input type="radio" name="rank" value="Master">                               Master              <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Rank Pending">                         Rank Pending        <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">        <input type="radio" name="rank" value="Grand Master 1">                       Grand Master 1      <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Professional Brewer">                  Professional Brewer <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;">  <input type="radio" name="rank" value="Grand Master 2">                       Grand Master 2      <br />
</td>
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Beer Sommelier">                       Beer Sommelier      <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;"><input type="radio" name="rank" value="Grand Master 3">                       Grand Master 3       <br />
</td>
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="GABF/WBC">                             GABF/WBC            <br />
</td>
</tr>

<tr valign="top">
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Honorary Master">                      Honorary Master     <br />
</td>
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Certified Cicerone">                   Certified Cicerone  <br />
</td>
</tr>
<tr valign="top">
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Honorary GM">                          Honorary GM         <br />
</td>
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Adv. Cicerone">                        Adv. Cicerone       <br />
</td>
</tr>
<tr valign="top">
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Mead Judge">                           Mead Judge          <br />
</td>
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Master Cicerone">                      Master Cicerone     <br />
</td>
</tr>
<tr valign="top">
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Cider Judge">                          Cider Judge         <br><br />
</td>
<td align="left" style="border-width : 0px;"> <input type="radio" name="rank" value="Sensory Training">                     Sensory Training    <br />
</td>
</tr>
</table>
</div>

  <br>

  <input type="submit" value="Click Here to Generate Score Sheets" style="font-size : 30px;height:70px;width:600px">
</form>



 
<script>
function myFunction() {
    document.getElementById("myForm").reset();
}
</script>




</body></html>

EOT;

echo $header;

?>
