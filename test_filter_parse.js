const { createCanvas } = require('canvas');

function checkFilter(filterStr) {
    const c = createCanvas(10, 10);
    const g = c.getContext('2d');
    g.fillStyle = 'blue';
    g.fillRect(0, 0, 10, 10);
    g.filter = filterStr;
    console.log(`Setting filter to: ${filterStr}`);
    console.log(`Actual g.filter value: ${g.filter}`);
}

checkFilter('grayscale(100%) brightness(110%) contrast(110%)');
checkFilter('brightness(122%) sepia(20%) saturate(41%) grayscale(20%)');
checkFilter('hue-rotate(0deg) saturate(41%) brightness(122%) contrast(100%) grayscale(20%) sepia(20%)');
checkFilter('brightness(1.22) sepia(0.2) saturate(0.41) grayscale(0.2)');
